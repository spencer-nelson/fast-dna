import {
    createColorPalette,
    DesignSystemDefaults,
} from "@microsoft/fast-components-styles-msft";
import { parseColorHexRGB } from "@microsoft/fast-colors";
import {
    AssignRecipeMessage,
    DesignSystemMessage,
    MessageAction,
    MessageTypes,
    RemoveRecipeMessage,
    UIMessage,
} from "./messaging";
import { PluginNode } from "./node";
import { RecipeRegistry, RecipeTypes } from "./recipe-registry";
import { PluginUIActiveNodeData, PluginUIProps } from "./ui";

import { merge } from "lodash";

/**
 * Controller class designed to handle the business logic of the plugin.
 * The controller is designed to be agnostic to the design environment,
 * relying on the abstract properties and methods to supply the implementation
 * details that might exist for the eco system it is being run in. (Figma, Sketch, etc)
 */
export abstract class Controller {
    public recipeRegistry: RecipeRegistry = new RecipeRegistry();

    /**
     * Track the currently selected node.
     */
    private _selectedNode: string[];

    /**
     * Retrieve a plugin Node by ID. Return null if no node by the provided ID exists
     * @param id The ID of the node
     */
    public abstract getNode(id: string): PluginNode | null;

    /**
     * Retrieve the selected node ID
     */
    public getSelectedNodes(): string[] {
        return this._selectedNode;
    }

    /**
     * Set the selected node ID - setting the ID will trigger
     * a UI refresh
     * @param ids the node IDs
     */
    public setSelectedNodes(ids: string[]): void {
        this._selectedNode = ids;

        // Queue update
        this.setPluginUIState(this.getPluginUIState());
    }

    /**
     * Retrieve the UI state
     */
    public getPluginUIState(): Omit<PluginUIProps, "dispatch"> {
        const selectedNodes = this.getSelectedNodes()
            .map(id => this.getNode(id))
            .filter((node): node is PluginNode => node !== null);
        const allSupported = Array.from(
            new Set(
                selectedNodes
                    .map(node => node.supports())
                    .reduce((prev, next) => prev.concat(next), [])
            )
        );

        return {
            selectedNodes: selectedNodes.map(
                (node): PluginUIActiveNodeData => ({
                    id: node.id,
                    type: node.type,
                    supports: node.supports(),
                    recipes: node.recipes,
                    designSystem: {
                        accentBaseColor:
                            node.designSystem.accentBaseColor ||
                            DesignSystemDefaults.accentBaseColor,
                        ...node.designSystemOverrides,
                    },
                })
            ),
            recipeOptions: selectedNodes.length
                ? allSupported
                      .filter((type): type is RecipeTypes => !!RecipeTypes[type])
                      .map(type => {
                          return {
                              type,
                              options: this.recipeRegistry.find(type).map(
                                  item =>
                                      this.recipeRegistry.toData(
                                          item.id,
                                          selectedNodes[0]
                                      ) // TODO: We probably shouldn't hard-code this, but what color do we display if there are multiple nodes?
                              ),
                          };
                      })
                : [],
        };
    }

    public handleMessage(message: UIMessage): void {
        switch (message.type) {
            case MessageTypes.recipe:
                message.action === MessageAction.assign
                    ? this.assignRecipe(message)
                    : this.removeRecipe(message);
                break;
            case MessageTypes.designSystem:
                this.handleDesignSystemMessage(message);
                break;
            case MessageTypes.reset:
                message.nodeIds
                    .map(id => this.getNode(id))
                    .filter((node): node is PluginNode => node !== null)
                    .forEach(node => {
                        // Delete design system
                        Object.keys(node.designSystemOverrides).map(key => {
                            node.deleteDesignSystemProperty(
                                key as keyof typeof node.designSystemOverrides
                            );
                        });

                        node.recipes = [];
                    });
                this.setPluginUIState(this.getPluginUIState());

                break;
            case MessageTypes.sync:
                message.nodeIds.forEach(id => this.paintTree(id));
                this.setPluginUIState(this.getPluginUIState());
                break;
            case MessageTypes.export:
                message.nodeIds.forEach(id => this.exportSelection(id));
                break;
        }
    }

    /**
     * Provides the state object to the UI component and updates the UI
     * @param state the UI state object
     */
    protected abstract setPluginUIState(state: Omit<PluginUIProps, "dispatch">): void;

    private handleDesignSystemMessage(message: DesignSystemMessage): void {
        const nodes = message.nodeIds
            .map(id => this.getNode(id))
            .filter((node): node is PluginNode => node !== null);

        switch (message.action) {
            case MessageAction.assign:
                nodes.forEach(node =>
                    node.setDesignSystemProperty(message.property, message.value)
                );

                if (message.property === ("accentBaseColor" as any)) {
                    const color = parseColorHexRGB(message.value as string);

                    if (color !== null) {
                        const palette: string[] = createColorPalette(color);

                        nodes.forEach(node =>
                            node.setDesignSystemProperty("accentPalette", palette)
                        );
                    }
                }

                break;
            case MessageAction.delete:
                nodes.forEach(node => node.deleteDesignSystemProperty(message.property));
                break;
        }

        nodes.forEach(node => this.paintTree(node.id));

        this.setPluginUIState(this.getPluginUIState());
    }

    private removeRecipe(message: RemoveRecipeMessage): void {
        message.nodeIds
            .map(id => this.getNode(id))
            .filter((node): node is PluginNode => node !== null)
            .forEach(node => {
                node.recipes = node.recipes.filter(
                    id => this.recipeRegistry.get(id).type !== message.recipeType
                );
            });

        this.setPluginUIState(this.getPluginUIState());
    }

    private assignRecipe(message: AssignRecipeMessage): void {
        message.nodeIds.forEach(id => {
            const node = this.getNode(id);

            if (!node) {
                return;
            }

            const recipe = this.recipeRegistry.get((message as any).id);

            switch (message.action) {
                case MessageAction.assign:
                    node.recipes = node.recipes
                        .filter(
                            recipeId =>
                                this.recipeRegistry.get(recipeId).type !== recipe.type
                        )
                        .concat(recipe.id);
                    break;
            }

            switch (recipe.type) {
                case RecipeTypes.backgroundFills:
                    this.paintTree(node.id);
                    break;
                case RecipeTypes.foregroundFills:
                case RecipeTypes.strokeFills:
                case RecipeTypes.cornerRadius:
                    node.paint(this.recipeRegistry.toData(recipe.id, node));
                    break;
            }
        });

        this.setPluginUIState(this.getPluginUIState());
    }

    private paintTree(id: string): void {
        const node = this.getNode(id);

        if (!node) {
            return;
        }

        // Paint all recipes of the node
        node.recipes.forEach(recipeId => {
            node.paint(this.recipeRegistry.toData(recipeId, node));
        });

        node.children().forEach(child => {
            if (node) {
                this.paintTree(child.id);
            }
        });
    }

    private exportSelection(id: string): void {
        // Get the plugin node
        const selectedNode = this.getNode(id);
        console.log("accent base = " + selectedNode?.designSystem.accentBaseColor);
        if (selectedNode) {
            var mergedObjects = this.exportGlobals(selectedNode);
            mergedObjects = merge(mergedObjects, this.exportAliases(selectedNode));
            console.log(JSON.stringify(mergedObjects));
            figma.ui.postMessage({ type: "export-data", data: mergedObjects });
        }
    }

    private exportGlobals(node: PluginNode) {
        // For now, just export the global accent colour
        var mergedObjects = {
            Global: {
                Color: { Accent: { buildRampFrom: node.designSystem.accentBaseColor } },
            },
        };

        return mergedObjects;
    }

    private exportAliases(node: PluginNode) {
        var mergedObjects = {};
        if (!node) return {};
        var exportDict = {};

        if (node?.type == "INSTANCE" || node?.type == "COMPONENT") {
            const figmaNode = figma.getNodeById(node.id);
            if (figmaNode?.type == "INSTANCE" || figmaNode?.type == "COMPONENT") {
                var master: BaseNode = figmaNode;
                if (figmaNode?.type == "INSTANCE") {
                    master = (figmaNode as InstanceNode).masterComponent;
                }
                var instanceObject = {};
                var categoryName = componentNameCategoryLookup[master.name];
                if (!categoryName) {
                    console.log("No master lookup for " + master.name);
                    return;
                }

                // split the category name
                // if it's 2 parts, it's iOS/Android
                // if it's 4, it's Web/WinUI

                node.recipes.forEach(id => {
                    let recipeData = this.recipeRegistry.toData(id, node);

                    var tokenAttribute = "";
                    var attributeStyle = "";
                    var styleDetail = "";
                    var detailVariation = "";

                    switch (recipeData.type) {
                        case RecipeTypes.backgroundFills:
                            tokenAttribute = "Root";
                            attributeStyle = "Fill";
                            styleDetail = "Color";
                            break;
                        case RecipeTypes.foregroundFills:
                            tokenAttribute = "Root";
                            attributeStyle = "Fill";
                            styleDetail = "Color";
                            break;
                        case RecipeTypes.strokeFills:
                            tokenAttribute = "Root";
                            attributeStyle = "Fill";
                            styleDetail = "Color";
                            break;
                        case RecipeTypes.cornerRadius:
                            tokenAttribute = "Root";
                            attributeStyle = "Corner";
                            styleDetail = "";
                            break;
                        default:
                            break;
                    }

                    // console.log(
                    //     categoryName +
                    //         ":" +
                    //         tokenAttribute +
                    //         ":" +
                    //         attributeStyle +
                    //         ":" +
                    //         styleDetail +
                    //         ":" +
                    //         detailVariation
                    // );
                    var tokenAlias = recipeAlias[recipeData.id];
                    var aliasObject = { aliasOf: tokenAlias };
                    var variationObject = {};
                    var detailObject = {};
                    var styleObject = {};
                    var attributeObject = {};
                    var categoryObject = {};

                    variationObject[detailVariation] = aliasObject;

                    if (detailVariation != "") {
                        detailObject[styleDetail] = variationObject;
                    } else {
                        detailObject[styleDetail] = aliasObject;
                    }

                    if (styleDetail != "") {
                        styleObject[attributeStyle] = detailObject;
                    } else {
                        styleObject[attributeStyle] = aliasObject;
                    }
                    attributeObject[tokenAttribute] = styleObject;
                    categoryObject[categoryName] = attributeObject;

                    instanceObject = merge(instanceObject, categoryObject);
                });

                console.log("returning: " + JSON.stringify(instanceObject));
                return instanceObject;
            }
        } else {
            node.children().forEach(child => {
                let tempy = this.exportAliases(child);
                // console.log('tempy: ' + JSON.stringify(tempy))
                mergedObjects = merge(mergedObjects, tempy);
                // console.log('Merged: ' + JSON.stringify(mergedObjects))
            });
        }

        return mergedObjects;
    }

    private attributeForRecipeType(type: RecipeTypes): TokenAttributes {
        var attribute = TokenAttributes.root;
        switch (type) {
            case RecipeTypes.backgroundFills:
            case RecipeTypes.foregroundFills:
            case RecipeTypes.strokeFills:
            case RecipeTypes.cornerRadius:
                attribute = TokenAttributes.root;
                break;
        }
        return attribute;
    }

    private styleForRecipeType(type: RecipeTypes): TokenStyles {
        var style = TokenStyles.fill;
        switch (type) {
            case RecipeTypes.backgroundFills:
            case RecipeTypes.foregroundFills:
            case RecipeTypes.strokeFills:
                style = TokenStyles.fill;
                break;
            case RecipeTypes.cornerRadius:
                style = TokenStyles.cornerRadius;
                break;
        }
        return style;
    }
}

enum TokenAttributes {
    root = "Root",
    text = "Text",
    none = "Alias",
}

enum TokenStyles {
    font = "Font",
    fill = "Fill",
    stroke = "Stroke",
    cornerRadius = "Corner",
    none = "Alias",
}

enum TokenCategories {
    button = "Button",
    accentButton = "AccentButton",
    outlineButton = "OutlineButton",
    header = "Header",
}

enum recipeAlias {
    accentFillRest = "Set.TempAccentBkg.Fill.Color",
    accentFillLargeRest = "Set.TempAccentBkg.Fill.Color",
    neutralFillRest = "Global.Color.Gray.40",
    neutralFillCard = "Global.Color.Gray.20",
    neutralFillInputRest = "Global.Color.White",
    neutralFillStealthRest = "Global.Color.White",
    neutralFillToggleRest = "Global.Color.Gray.120",
    neutralLayerCard = "Global.Color.White",
    neutralLayerFloating = "Global.Color.White",
    neutralLayerL1 = "Global.Color.White",
    neutralLayerL1Alt = "Global.Color.Gray.20",
    neutralLayerL2 = "Global.Color.Gray.40",
    neutralLayerL3 = "Global.Color.Gray.60",
    neutralLayerL4 = "Global.Color.Gray.80",
    square = "Set.Square.Corner",
    control = "Set.Control.Corner",
    surface = "Set.Surface.Corner",
    illustration = "Set.Illustration.Corner",
    round = "Set.Round.Corner",
}

const componentNameCategoryLookup = {
    "01. Primary Filled / ⚪️ A. Default - Light": TokenCategories.accentButton,
    "02. iPhone 8 / 01. Portrait / 🔵 B. Large Title + Search - Primary":
        TokenCategories.header,
    "01. Primary Filled / ⚪️ B. Pressed - Light": TokenCategories.accentButton,
    "01. Primary Filled / ⚪️ C. Disabled - Light": TokenCategories.accentButton,
    "01. Primary / ⚪️ A. Default - Light": TokenCategories.accentButton,
    "01. Primary / ⚪️ C. Disabled - Light": TokenCategories.accentButton,
    "Button / State / Accent /⚡ Press": TokenCategories.accentButton,
    "Button / State / Accent /⚡ Disabled": TokenCategories.accentButton,
};
