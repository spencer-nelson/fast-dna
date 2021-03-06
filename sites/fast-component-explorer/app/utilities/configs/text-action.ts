import {
    buttonSchema,
    TextAction,
    TextActionAppearance,
    TextActionProps,
    textActionSchema,
} from "@microsoft/fast-components-react-msft";
import { glyphSchema, Icon } from "../../../app/components/glyph";
import Guidance from "../../.tmp/text-action/guidance";
import { ComponentViewConfig } from "./data.props";

const textActionConfig: ComponentViewConfig<TextActionProps> = {
    schema: textActionSchema,
    component: TextAction,
    guidance: Guidance,
    scenarios: [
        {
            displayName: "Filled",
            data: {
                appearance: TextActionAppearance.filled,
                button: {
                    id: buttonSchema.id,
                    props: {
                        children: {
                            id: glyphSchema.id,
                            props: {
                                path: Icon.arrow,
                            },
                        },
                    },
                } as any,
                beforeGlyph: {
                    id: glyphSchema.id,
                    props: {
                        path: Icon.user,
                    },
                } as any,
            },
        },
        {
            displayName: "Outline",
            data: {
                appearance: TextActionAppearance.outline,
                button: {
                    id: buttonSchema.id,
                    props: {
                        children: {
                            id: glyphSchema.id,
                            props: {
                                path: Icon.arrow,
                            },
                        },
                    },
                } as any,
                beforeGlyph: {
                    id: glyphSchema.id,
                    props: {
                        path: Icon.user,
                    },
                } as any,
            },
        },
    ],
};

export default textActionConfig;
