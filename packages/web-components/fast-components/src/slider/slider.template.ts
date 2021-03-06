import { html } from "@microsoft/fast-element";
import { ref } from "@microsoft/fast-element/dist/directives";
import { Slider } from "./slider";

export const SliderTemplate = html<Slider>`
    <template
        role="slider"
        tabindex="${x => (x.disabled ? null : 0)}"
        aria-valuenow="${x => x.value}"
        aria-valuemin="${x => x.min}"
        aria-valuemax="${x => x.max}"
        ?aria-disabled="${x => x.disabled}"
        ?aria-readonly="${x => x.readOnly}"
        aria-orientation="${x => x.orientation}"
        class="${x => x.orientation}"
    >
        <div part="positioning-region" class="positioning-region">
            <div ${ref("track")} part="track-container" class="track">
                <slot name="track"></slot>
            </div>
            <div></div>
            <slot></slot>
            <div
                ${ref("thumb")}
                part="thumb-container"
                class="thumb-container"
                style=${x => x.position}
            >
                <slot name="thumb"><div class="thumb-cursor"></div></slot>
            </div>
        </div>
    </template>
`;
