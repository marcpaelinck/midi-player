import { delay } from "./utilities.js";

class Key {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.w = width;
        this.h = height;
    }
}

const colorGold = "rgba(255, 215, 0, 1)";
const colorBorder = "black";
const colorGoldTransparent = "rgba(255, 215, 0, .3)";
const colorDefault = colorGoldTransparent;
const colorHilite = "green";

/**
 * Used by the Highlighter class to keep track of highlighting activities.
 */
class Token {
    constructor() {
        this.enabled = true;
    }
}

/**
 * Enables to perform highlighting that fades off.
 */
class Highligher {
    fade_steps = 20;
    fade_duration = 1000; // Milliseconds.
    fade_step_duration = Math.floor(this.fade_duration / this.fade_steps);
    active_tokens = [];

    /**
     * Starts highlighting of a key. The highlight fades by redrawing the
     * highlight with decreasing alpha
     * @param {Object} key Dict object representing the key to highlight
     */
    async color(key) {
        this.kill_all(); // End any unfinished fading process.
        // The fading process can be interrupted by setting the token's enabled property to false.
        let token = new Token();
        this.active_tokens.push(token);
        for (let step = this.fade_steps; (step > 0) & token.enabled; step--) {
            let alpha = step / this.fade_steps;
            draw_key(this.context, key, true, alpha);
            await delay(this.fade_step_duration);
        }
        draw_key(this.context, key, false);
    }

    /**
     * Causes any active highlighting to stop.
     */
    kill_all() {
        while (this.active_tokens.length > 0) {
            let token = this.active_tokens.pop();
            token.enabled = false;
        }
    }

    constructor(context) {
        this.context = context;
        // this.active_tokens = []; // each call to color() creates its own token.
    }
}

export function initialize_canvas(canvas) {
    // Get the encompasssing row div element (which is not necessarily the direct parent div)
    let parent_rowdiv = canvas.ownerDocument.querySelector("#canvas").closest("div.mp-row.mp-animation");
    let animation_width = Math.min(600, parent_rowdiv.clientWidth);
    canvas.width = animation_width;
    canvas.height = Math.floor(animation_width / 3);
}

export function drawInstrument(canvas, instrument, synthesizer) {
    // Clear the canvas and synthesizer events
    const drawingContext = canvas.getContext("2d");
    drawingContext.clearRect(0, 0, canvas.width, canvas.height);
    delete_keyboard_events(synthesizer);

    if (instrument == null) return;

    let config = instrument["configuration"];

    // Can currently only animate metallophones
    // TODO: enable animating circles and non-consecutive note indices)
    if (instrument["shape"] == "rectangle") {
        let keys = [];
        let gap_ratio = 0.1; // small gap between the instrument keys
        let GAP_ratio = 0.2; // wider gap where the suspenders are placed
        let tot_GAPS = config.length - 1; // # wider gaps
        let tot_keys = 0;
        for (let gidx = 0; gidx < config.length; gidx++) {
            tot_keys += config[gidx].length;
        }
        let tot_gaps = tot_keys - 1 - tot_GAPS; // # regular gaps

        let key_width = Math.floor(canvas.width / (tot_keys + GAP_ratio * tot_GAPS + gap_ratio * tot_gaps));
        let gap_width = Math.floor(key_width * gap_ratio);
        let GAP_width = Math.floor(key_width * GAP_ratio);
        let key_height = Math.floor(canvas.height * 0.9);

        let xpos = 0;

        for (let gidx = 0; gidx < config.length; gidx++) {
            for (let kidx = 0; kidx < config[gidx].length; kidx++) {
                let key = new Key(xpos, 0, key_width, key_height);
                keys.push(key);
                draw_key(drawingContext, key, false);
                // Add a small gap between the keys
                xpos += key_width + gap_width;
            }
            // Replace the small gap with a wider gap between key groups
            xpos += GAP_width - gap_width;
        }

        setSynthesizerEvents(synthesizer, instrument, keys, drawingContext);
    }
}

/**
 * Deletes all animation events from the synthesizer
 * @param {*} synth
 */
function delete_keyboard_events(synth) {
    let events = ["noteon", "noteoff", "stopall"];
    for (let i = 0; i < events.length; i++)
        if (synth.eventHandler.events[events[i]].hasOwnProperty("keyboard")) {
            delete synth.eventHandler.events[events[i]]["keyboard"];
        }
}
function draw_key(context, key, hilite, alpha = 1) {
    context.strokeStyle = colorBorder;
    // if (hilite) {
    //     context.fillStyle = colorHilite;
    // } else {
    //     context.fillStyle = colorDefault;
    // }
    context.globalAlpha = 1;
    context.clearRect(key.x, key.y, key.w, key.h);
    context.fillStyle = colorDefault;
    context.fillRect(key.x, key.y, key.w, key.h);
    if (hilite) {
        // Draw the hilite on top of the default color.
        context.fillStyle = colorHilite;
        context.globalAlpha = alpha;
        context.fillRect(key.x, key.y, key.w, key.h);
    }
    context.strokeRect(key.x, key.y, key.w, key.h);
}

function setSynthesizerEvents(synthesizer, instrument, keys, drawingContext) {
    let offset = instrument.midioffset;
    let hiliter = new Highligher(drawingContext);
    synthesizer.eventHandler.addEvent("noteon", "keyboard", (event) => {
        if (event.channel == instrument["channel"]) {
            let key = keys[(event.midiNote - 1 - offset) % keys.length];
            hiliter.color(key);
            // draw_key(drawingContext, key, true);
        }
    });

    // add note off listener
    synthesizer.eventHandler.addEvent("noteoff", "keyboard", (event) => {
        if (event.channel == instrument["channel"]) {
            let key = keys[(event.midiNote - 1 - offset) % keys.length];
            // draw_key(drawingContext, key, false);
            hiliter.kill_all();
        }
    });

    synthesizer.eventHandler.addEvent("stopall", "keyboard", () => {
        hiliter.kill_all();
        // keys.forEach((key) => draw_key(drawingContext, key, false));
    });
}
