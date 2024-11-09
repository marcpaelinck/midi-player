import { delay } from "./utilities.js";

const CIRCLE = "circle";
const RECTANGLE = "rectangle";

let IdGenerator = 0;

class Key {
    note;
    shape;
    x;
    y;
    width;
    heigh;

    constructor(note, shape, x, y, width, height) {
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

class Abort {
    value;

    constructor(isActive) {
        this.value = isActive;
    }

    set(val) {
        this.value = val;
    }
}

/**
 * Enables to perform highlighting that fades off.
 */
class Highlighter {
    id;
    animator;
    drawingContext;
    key;
    midiNote;
    startAnimation;
    fade_duration = 1000; // Milliseconds.

    constructor(animator, key, midiNote) {
        this.id = IdGenerator++;
        this.animator = animator;
        this.drawingContext = animator.drawingContext;
        this.key = key;
        this.midiNote = midiNote;
        this.startAnimation = new Date();
    }

    /**
     * Clears the current path.
     */
    close() {
        this.drawingContext.beginPath();
    }

    /**
     * Starts highlighting animation of a key. The highlight is faded by gradually
     * decreasing the alpha value of the highlight color.
     * The animation can be interrupted by removing the key from the active_key list.
     * @param {Object} key Dict object representing the key to highlight
     */

    draw_key() {
        this.drawingContext.strokeStyle = colorBorder;
        this.drawingContext.globalAlpha = 1;
        this.drawingContext.clearRect(this.key.x, this.key.y, this.key.width, this.key.height);
        this.drawingContext.fillStyle = colorDefault;
        if (this.key.shape === RECTANGLE) {
            this.drawingContext.fillRect(this.key.x, this.key.y, this.key.width, this.key.height);
            this.drawingContext.strokeRect(this.key.x, this.key.y, this.key.width, this.key.height);
        } else if (this.key.shape === CIRCLE) {
            let radius = Math.floor(this.key.width / 2);
            this.drawingContext.beginPath();
            this.drawingContext.arc(this.key.x + radius, this.key.y + radius, radius, 0, 2 * Math.PI);
            this.drawingContext.fill();
            this.drawingContext.globalAlpha = 1;
            this.drawingContext.stroke();
        }
    }

    currentAlpha() {
        let elapsedMillis = new Date().getTime() - this.startAnimation.getTime();
        return Math.max(1 - elapsedMillis / this.fade_duration, 0);
    }

    #hilite_frame() {
        this.draw_key();
        // Draw the hilite on top of the default color.
        let alpha = this.currentAlpha();
        let finished = false;
        if (alpha > 0) {
            this.drawingContext.strokeStyle = colorBorder;
            if (this.key.shape === RECTANGLE) {
                this.drawingContext.fillStyle = colorHilite;
                this.drawingContext.globalAlpha = alpha;
                this.drawingContext.fillRect(this.key.x, this.key.y, this.key.width, this.key.height);
                this.drawingContext.strokeRect(this.key.x, this.key.y, this.key.width, this.key.height);
            } else if (this.key.shape === CIRCLE) {
                let radius = Math.floor(this.key.width / 2);
                this.drawingContext.beginPath();
                this.drawingContext.arc(this.key.x + radius, this.key.y + radius, radius, 0, 2 * Math.PI);
                this.drawingContext.fillStyle = colorHilite;
                this.drawingContext.globalAlpha = alpha;
                this.drawingContext.fill();
                this.drawingContext.globalAlpha = 1;
                this.drawingContext.stroke();
                this.drawingContext.beginPath();
            }
        } else {
            finished = true;
        }
        return finished;
    }

    start_hilite(abortSignalList) {
        let highlighter = this;
        let abortSignals = abortSignalList;
        do_loop();

        function do_loop() {
            let abort = highlighter.#hilite_frame();
            abortSignals.forEach((signal) => (abort = abort || signal.value));
            if (!abort) {
                window.requestAnimationFrame(do_loop);
            } else {
                highlighter.draw_key();
            }
        }
    }
}

export class Animator {
    canvas = null;
    synthesizer = null;
    drawingContext = null;
    abortAllSignal;
    // hiliters = [];

    constructor(canvas, synthesizer) {
        this.canvas = canvas;
        this.synthesizer = synthesizer;
        this.#initialize_canvas();
        this.drawingContext = this.canvas.getContext("2d");
        this.abortAllSignal = new Abort(false);
    }

    draw(instrument) {
        // Clear the canvas and existing animation events
        this.#delete_animation_events();
        this.abortAllSignal.set(true);

        // Wait for all animation to finish
        delay(150).then(() => {
            this.#clear_canvas();

            if (instrument == null) return;

            let config = instrument["configuration"];

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
                        keys.push(key);
                        let hiliter = this.newHighlighter(key, 0);
                        hiliter.draw_key(key, false);
                        console.log(`Creating key ${key.note}`);
                        // Add a small gap between the keys
                        xpos += key_width + gap_width;
                    }
                    // Replace the small gap with a wider gap between key groups
                    xpos += GAP_width - gap_width;
                }

                this.abortAllSignal.set(false);
                this.#set_animation_events(this.synthesizer, instrument, keys);
            }
        });
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

    newHighlighter(key, midiNote) {
        let hiliter = new Highlighter(this, key, midiNote);
        // this.hiliters.push(hiliter);
        return hiliter;
    }

    abortAllHighlighters() {
        this.abortAllSignal.set(true);
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
        let animator = this;

        synthesizer.eventHandler.addEvent("noteon", "animation", (event_on) => {
            if (event_on.channel == instrument["channel"]) {
                let key = keys[(event_on.midiNote - 1 - offset) % keys.length].clone();
                let highLighter = animator.newHighlighter(key, event_on.midiNote);
                console.log(`animation requested for key ${key.note}${highLighter.id}`);
                let abortSignal = new Abort(false);
                highLighter.start_hilite([abortSignal, animator.abortAllSignal]);

                // add Highlighter to note off listeners
                synthesizer.eventHandler.addEvent("noteoff", `animation${event_on.midiNote}`, (event_off) => {
                    if (event_off.channel == instrument["channel"]) {
                        if (event_off.midiNote === highLighter.midiNote) {
                            console.log(`END animation requested for key ${key.note}${highLighter.id}`);
                            abortSignal.set(true);
                        }
                    }
                });
            }
        });

        synthesizer.eventHandler.addEvent("stopall", "animation", () => {
            // this.highLighter.stop_all();
        });
    }

    /**
     * Deletes all animation events from the synthesizer
     * @param {*} synth
     */
    #delete_animation_events() {
        let events = this.synthesizer.eventHandler.events;
        let names = ["noteon", "noteoff", "stopall"];
        names.forEach((name) => {
            for (const [id, value] of Object.entries(events[name])) {
                if (id.startsWith("animation")) {
                    this.synthesizer.eventHandler.callEvent(events["name"], null);
                }
            }
        });
    }
}
