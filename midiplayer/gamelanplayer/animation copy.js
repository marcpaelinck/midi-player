import { delay } from "./utilities.js";

const CIRCLE = "circle";
const RECTANGLE = "rectangle";

let IdGenerator = 0;

class Key {
    id;
    note;
    shape;
    x;
    y;
    width;
    heigh;

    constructor(note, shape, x, y, width, height) {
        this.id = IdGenerator++;
        this.note = note;
        this.shape = shape;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    clone() {
        return new Key(this.note, this.shape, this.x, this.y, this.width, this.height);
    }
}

const colorGold = "rgba(255, 215, 0, 1)";
const colorBorder = "black";
const colorGoldTransparent = "rgba(255, 215, 0, .3)";
const colorDefault = colorGoldTransparent;
const colorHilite = "green";

/**
 * Enables to perform highlighting that fades off.
 */
class Highlighter {
    animator;
    active_keys = []; // Key currently being animated.
    fade_steps = 20;
    fade_duration = 1000; // Milliseconds.
    fade_step_duration = Math.floor(this.fade_duration / this.fade_steps);

    constructor(animator) {
        this.animator = animator;
    }

    /**
     * Starts highlighting animation of a key. The highlight is faded by gradually
     * decreasing the alpha value of the highlight color.
     * The animation can be interrupted by removing the key from the active_key list.
     * @param {Object} key Dict object representing the key to highlight
     */
    async highlight(key) {
        if (this.active_keys.includes(key)) this.stop_highlight(key); // should not happen unless note_off was missing.
        this.active_keys.push(key);
        console.log(`--animation ${key.note}${key.id} started`);
        for (let step = this.fade_steps; step > 0 && this.active_keys.includes(key); step--) {
            let alpha = step / this.fade_steps;
            this.animator.draw_key(key, true, alpha);
            console.log(`-----redrawing ${key.note}${key.id}`);
            await delay(this.fade_step_duration);
        }
        console.log(`--animation ${key.note}${key.id} ended`);
        this.animator.draw_key(key, false);
    }

    draw(key) {}

    /**
     * Cancels highlighting for the given key.
     */
    stop_highlight(key) {
        if (this.active_keys.includes(key)) {
            let idx = this.active_keys.indexOf(key.key);
            console.log(`--end animation initiated for key ${key.note}${key.id}`);
            this.active_keys.splice(idx, 1);
        } else {
            console.log(`--animation not found for key ${key.note}${key.id}`);
        }
    }

    /**
     * Causes any active highlighting to stop.
     */
    stop_all() {
        while (this.active_keys.length > 0) {
            this.active_keys.pop();
        }
    }
}

export class Animator {
    canvas = null;
    drawingContext = null;
    highLighter = null;

    constructor(canvas) {
        this.canvas = canvas;
        this.#initialize_canvas();
        this.drawingContext = this.canvas.getContext("2d");
        this.highLighter = new Highlighter(this);
    }

    animate(instrument, synthesizer) {
        // Clear the canvas and existing animation events
        this.#delete_animation_events(synthesizer);
        this.highLighter.stop_all();
        // Wait for all animation to finish
        delay(150).then(() => {
            this.#clear_canvas();

            if (instrument == null) return;

            let config = instrument["configuration"];

            // Can currently only animate metallophones
            // TODO: enable non-consecutive note indices)
            if (instrument["shape"] === RECTANGLE || instrument["shape"] === CIRCLE) {
                let keys = [];
                let gap_ratio = 0.1; // small gap between the instrument keys
                let GAP_ratio = 0.2; // wider gap where the suspenders are placed
                let tot_GAPS = config.length - 1; // # wider gaps
                let tot_keys = 0;
                for (let gidx = 0; gidx < config.length; gidx++) {
                    tot_keys += config[gidx].length;
                }
                let tot_gaps = tot_keys - 1 - tot_GAPS; // # regular gaps

                let key_width = Math.floor(
                    this.canvas.width / (tot_keys + GAP_ratio * tot_GAPS + gap_ratio * tot_gaps)
                );
                let gap_width = Math.floor(key_width * gap_ratio);
                let GAP_width = Math.floor(key_width * GAP_ratio);
                let key_height = Math.floor(this.canvas.height * 0.9);
                if (instrument["shape"] === CIRCLE) key_height = key_width;

                let xpos = 0;

                for (let gidx = 0; gidx < config.length; gidx++) {
                    for (let kidx = 0; kidx < config[gidx].length; kidx++) {
                        let key = new Key(config[gidx][kidx], instrument["shape"], xpos, 0, key_width, key_height);
                        console.log(`Creating key ${key.note}${key.id}`);
                        keys.push(key);
                        this.draw_key(key, false);
                        // Add a small gap between the keys
                        xpos += key_width + gap_width;
                    }
                    // Replace the small gap with a wider gap between key groups
                    xpos += GAP_width - gap_width;
                }

                this.#set_animation_events(synthesizer, instrument, keys);
            }
        });
    }

    draw_key(key, hilite, alpha = 1) {
        this.drawingContext.strokeStyle = colorBorder;
        this.drawingContext.globalAlpha = 1;
        this.drawingContext.clearRect(key.x, key.y, key.width, key.height);
        this.drawingContext.fillStyle = colorDefault;

        if (key.shape === RECTANGLE) {
            this.drawingContext.fillRect(key.x, key.y, key.width, key.height);
            if (hilite) {
                // Draw the hilite on top of the default color.
                this.drawingContext.fillStyle = colorHilite;
                this.drawingContext.globalAlpha = alpha;
                this.drawingContext.fillRect(key.x, key.y, key.width, key.height);
            }
            this.drawingContext.strokeRect(key.x, key.y, key.width, key.height);
        } else {
            let radius = Math.floor(key.width / 2);
            this.drawingContext.beginPath();
            this.drawingContext.arc(key.x + radius, key.y + radius, radius, 0, 2 * Math.PI);
            this.drawingContext.fill();
            if (hilite) {
                // Draw the hilite on top of the default color.
                this.drawingContext.fillStyle = colorHilite;
                this.drawingContext.globalAlpha = alpha;
                this.drawingContext.fill();
            }
            this.drawingContext.globalAlpha = 1;
            this.drawingContext.stroke();
        }
    }

    /* Private methods */

    #initialize_canvas() {
        // Get the encompasssing row div element (which is not necessarily the direct parent div)
        let parent_rowdiv = this.canvas.ownerDocument.querySelector("#canvas").closest("div.mp-row.mp-animation");
        let animation_width = Math.min(600, parent_rowdiv.clientWidth);
        this.canvas.width = animation_width;
        this.canvas.height = Math.floor(animation_width / 3);
    }

    #clear_canvas() {
        this.drawingContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Adds event to the synthesizer event handler which highlight the key of the
     * midi notes that ar is being played.
     * @param {Synthetizer} synthesizer
     * @param {JSON} instrument
     * @param {Array[Key]} keys
     */
    #set_animation_events(synthesizer, instrument, keys) {
        let offset = instrument.midioffset;
        let playing = [];

        synthesizer.eventHandler.addEvent("noteon", "animation", (event) => {
            if (event.channel == instrument["channel"]) {
                let key = keys[(event.midiNote - 1 - offset) % keys.length].clone();
                playing.push(key);
                console.log(`animation requested for key ${key.note}${key.id}`);
                this.highLighter.highlight(key);
            }
        });

        // add note off listener
        synthesizer.eventHandler.addEvent("noteoff", "animation", (event) => {
            if (event.channel == instrument["channel"]) {
                let key = keys[(event.midiNote - 1 - offset) % keys.length];
                let keyIdx = playing.findIndex((k) => k.note == key.note);
                let playingKey = null;
                if (keyIdx != null) playingKey = playing.splice(keyIdx, 1)[0];
                console.log(`END animation requested for key ${playingKey.note}${playingKey.id}`);
                this.highLighter.stop_highlight(playingKey);
            }
        });

        synthesizer.eventHandler.addEvent("stopall", "animation", () => {
            this.highLighter.stop_all();
        });
    }

    /**
     * Deletes all animation events from the synthesizer
     * @param {*} synth
     */
    #delete_animation_events(synth) {
        let events = ["noteon", "noteoff", "stopall"];
        for (let i = 0; i < events.length; i++)
            if (synth.eventHandler.events[events[i]].hasOwnProperty("animation")) {
                delete synth.eventHandler.events[events[i]]["animation"];
            }
    }
}
