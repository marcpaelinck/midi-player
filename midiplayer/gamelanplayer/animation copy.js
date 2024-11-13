import { delay } from "./utilities.js";

const colorClear = "rgb(255, 255, 255)";
const colorBorder = "black";
const colorGold = "rgb(255, 215, 0)";
const colorGoldLight = "rgb(255, 243, 178)";
const colorDefault = colorGoldLight;
const colorHilite = ["green", "purple", "orange"];
const CIRCLE = "circle";
const RECTANGLE = "rectangle";
const TRAPEZE = "trapeze";

let IdGenerator = 0;

class Key {
    note;
    midiNote;
    shape;
    x;
    y;
    width;
    height;
    drawingContext;
    sequence;

    constructor(note, midiNote, shape, x, y, width, height, drawingContext, sequence) {
        this.note = note;
        this.midiNote = midiNote;
        this.shape = shape;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.drawingContext = drawingContext;
        this.sequence = sequence;
    }

    /**
     * Creates the path for the contours of the key.
     */
    #createPath() {
        this.drawingContext.beginPath();
        switch (this.shape) {
            case RECTANGLE:
                // Using path instead of drawRectangle to make the draw function generic.
                this.drawingContext.moveTo(this.x, this.y);
                this.drawingContext.lineTo(this.x, this.y + this.height);
                this.drawingContext.lineTo(this.x + this.width, this.y + this.height);
                this.drawingContext.lineTo(this.x + this.width, this.y);
                this.drawingContext.closePath();
                break;
            case CIRCLE:
                let radius = Math.floor(this.width / 2);
                this.drawingContext.arc(this.x + radius, this.y + radius, radius, 0, 2 * Math.PI);
                break;
            case TRAPEZE:
                this.drawingContext.moveTo(this.x, this.y + Math.floor(this.height / 3));
                this.drawingContext.lineTo(this.x, this.y + Math.floor((2 * this.height) / 3));
                this.drawingContext.lineTo(this.x + this.width, this.y + this.height);
                this.drawingContext.lineTo(this.x + this.width, this.y);
                this.drawingContext.closePath();
                break;
            default:
        }
    }

    /**
     * Draws the key on the canvas
     * @param {string} color
     * @param {number} alpha
     */
    draw(color = colorDefault, alpha = 1) {
        this.drawingContext.strokeStyle = colorBorder;
        this.drawingContext.globalAlpha = alpha;
        this.drawingContext.fillStyle = color;
        this.#createPath();
        this.drawingContext.fill();
        this.drawingContext.globalAlpha = 1;
        this.drawingContext.stroke();
    }
}

/**
 * Token than can be used to abort a highlighting animation
 */
class Abort {
    value;

    /**
     * @param {boolean} status true=set, false=unset.
     */
    constructor(status) {
        this.value = status;
    }

    raise() {
        this.value = true;
    }

    clear() {
        this.value = false;
    }

    isRaised() {
        return this.value;
    }
}

/**
 * Performs the highlighting animation (fading off).
 */
class Highlighter {
    id;
    eventDict; // Dictionary containing the noteoff events of the sythesizer.
    drawingContext; // Canvas drawingContext.
    key; // Key object that should be highlighted.
    hiliteColor;
    channel;
    midiNote; // Midi note that is being played.
    startAnimation; // Starting time of the highlighter's animation.
    eventOffID = null; // ID of this highlighter's abort event (see below).
    fade_duration = 1000; // Duration of the animation in milliseconds.

    constructor(key, hiliteColor, midiNote, channel, eventDict, drawingContext) {
        this.id = IdGenerator++;
        this.key = key;
        this.hiliteColor = hiliteColor;
        this.channel = channel;
        this.midiNote = midiNote;
        this.eventDict = eventDict;
        this.drawingContext = drawingContext;
        this.startAnimation = new Date();
    }

    /**
     * Sets the ID of the noteoff event for the current note. This event will abort the
     * highlighting animation in case it has not yet ended by itself.
     * This ID will be used to delete the event after the animation is completed.
     * @param {*} value
     */
    setEventOffID(value) {
        this.eventOffID = value;
    }

    /**
     * Deletes the aborting event.
     */
    deleteSynthNoteOffEvent() {
        if (this.eventOffID in this.eventDict) {
            delete this.eventDict[this.eventOffID];
        }
    }

    /**
     * Determines the alpha value for the highlighting based on the time since the animation started.
     * @returns Alpha value (between 0 and 1)
     */
    currentAlpha() {
        let elapsedMillis = new Date().getTime() - this.startAnimation.getTime();
        return Math.max(1 - elapsedMillis / this.fade_duration, 0);
    }

    /**
     * Determines a single frame of the animation.
     * @returns true if this is the last frame of the animation.
     */
    #hilite_frame() {
        // Draw a non-highlighted key
        this.key.draw();
        // Draw the hilite on top of the default color.
        let alpha = this.currentAlpha();
        if (alpha > 0) this.key.draw(this.hiliteColor, alpha);
        return alpha <= 0;
    }

    /**
     * Performs the highlighting animation.
     * The animation can be aborted by setting the abort status of an Abort object in the list.
     * @param {Abort[]} abortObjectList List of abort objects to listen to.
     */
    start_hilite(abortObjectList) {
        let highlighter = this;
        let abortObjects = abortObjectList;
        do_loop();

        function do_loop() {
            let abort = highlighter.#hilite_frame();
            abortObjects.forEach((signal) => (abort = abort || signal.isRaised()));
            if (!abort) {
                window.requestAnimationFrame(do_loop);
            } else {
                highlighter.key.draw();
                highlighter.deleteSynthNoteOffEvent();
            }
        }
    }
}

/**
 * Coordinates the animation.
 * Draws the inital layout and creates event listeners for the synthesizer.
 */
export class Animator {
    canvas = null;
    synthesizer = null;
    drawingContext = null;
    instrument = null;
    keys = null;
    abortAll;

    constructor(canvas, synthesizer) {
        this.canvas = canvas;
        this.synthesizer = synthesizer;
        this.drawingContext = this.canvas.getContext("2d");
        this.abortAll = new Abort(false);
        this.#initialize_canvas();
        this.#set_animation_events(this.synthesizer);
    }

    /**
     * Returns the key that corresponds with the given MIDI note number
     * and the color that corresponds with the stroke type.
     * @param {number} midiNote
     * @returns Key object.
     */
    getKeyAndColor(midiNote) {
        // The MIDI notes are numbered from 1 through N where N is the total number of keys.
        // In case of multiple strokes ([open], [abbreviated], [muted] or for the kendang [kp], [dt], [nu]),
        // the second stroke is numbered from N+1 through 2N, the next from 2N+1 through 3N etc.
        // Currently the kempli and gong section are both on channel 0 with notes 1 for kempli and 2-4 for G, P and T.
        let key = this.keys[(midiNote - 1 - this.instrument.midioffset) % this.keys.length];
        let hiliteColor = colorHilite[Math.floor((midiNote - 1 - this.instrument.midioffset) / this.keys.length)];
        return [key, hiliteColor];
    }

    /**
     * Initializes the animator for the given instrument.
     * @param {JSON} instrument Contains information about the instrument.
     */
    set_instrument(instrument) {
        this.instrument = instrument;
        if (instrument == null) return;

        // Determine dimensions of keys and separating gaps
        let config = instrument["configuration"];
        let gap_ratio = 0.1; // small gap between the instrument keys
        let GAP_ratio = 0.2; // wider gap where the suspenders are placed
        let tot_GAPS = config.length - 1; // # wider gaps
        let tot_keys = 0;
        let notes = [];
        for (let gidx = 0; gidx < config.length; gidx++) {
            tot_keys += config[gidx].length;
            for (let kidx = 0; kidx < config[gidx].length; kidx++) {
                notes.push(config[gidx][kidx]);
            }
        }
        let tot_gaps = tot_keys - 1 - tot_GAPS; // # regular gaps
        let key_width = Math.floor(this.canvas.width / (tot_keys + GAP_ratio * tot_GAPS + gap_ratio * tot_gaps));
        let gap_width = Math.floor(key_width * gap_ratio);
        let GAP_width = Math.floor(key_width * GAP_ratio);
        let key_height = Math.floor(this.canvas.height * 0.9);
        if (this.instrument["shape"] === CIRCLE) key_height = key_width;

        let sequence;
        if ("sequence" in instrument) {
            // Retrieve specification of midinotes
            sequence = instrument.sequence;
        } else {
            // Default: MIDI notes numbered sequencially from 1.
            sequence = [];
            for (let i = 1; i < tot_keys; i++) {
                sequence.push(i);
            }
        }

        // Populate the keys collection
        this.keys = [];
        let xpos = 0;
        let count = 0;
        for (let gidx = 0; gidx < config.length; gidx++) {
            for (let kidx = 0; kidx < config[gidx].length; kidx++) {
                let key = new Key(
                    notes[sequence[count] - 1],
                    sequence[count],
                    this.instrument["shape"],
                    xpos,
                    0,
                    key_width,
                    key_height,
                    this.drawingContext,
                    sequence[count]
                );
                this.keys.push(key);
                // Add a small gap between the keys
                xpos += key_width + gap_width;
                count++;
            }
            // Replace the small gap with a wider gap between key groups
            xpos += GAP_width - gap_width;
        }
        this.keys.sort((a, b) => {
            return Math.sign(a.midiNote - b.midiNote);
        });
    }

    /**
     * Starts the animation by drawing the initial layout.
     * The synthesizer events will take care of the highlighting animation.
     * If
     */
    animate() {
        // Clear the canvas and existing animation events
        this.abortAll.raise();

        // Wait for all animation to finish
        delay(100).then(() => {
            this.#clear_canvas();

            // No instrument focus selected
            if (this.instrument == null) return;

            // TODO: enable non-consecutive note indices)
            this.keys.forEach((key) => key.draw());
            this.abortAll.clear();
        });
    }

    /* Private methods */

    /**
     * Sets up the canvas sizes.
     */
    #initialize_canvas() {
        // Get the encompasssing row div element (which is not necessarily the direct parent div)
        let parent_rowdiv = this.canvas.ownerDocument.querySelector("#canvas").closest("div.mp-row.mp-animation");
        let animation_width = Math.min(600, parent_rowdiv.clientWidth);
        this.canvas.width = animation_width;
        this.canvas.height = Math.floor(animation_width / 2);
    }

    #clear_canvas() {
        this.drawingContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Adds synthesizer noteon/noteoff events to highlight the corresponding key on the canvas.
     * @param {Synthetizer} synthesizer
     * @param {JSON} instrument
     * @param {Array[Key]} keys
     */
    #set_animation_events(synthesizer) {
        let animator = this;

        synthesizer.eventHandler.addEvent("noteon", "animation", (event_on) => {
            if (animator.instrument == null) return;
            if (animator.instrument["channels"].includes(event_on.channel)) {
                let [key, color] = animator.getKeyAndColor(event_on.midiNote);
                let highLighter = new Highlighter(
                    key,
                    color,
                    event_on.midiNote,
                    event_on.channel,
                    synthesizer.eventHandler.events["noteoff"]
                );
                // console.log(`animation requested for key ${key.note}${highLighter.id}`);
                let abortSignal = new Abort(false);
                let eventOffID = `animation${event_on.midiNote}`;
                highLighter.setEventOffID(eventOffID);
                highLighter.start_hilite([abortSignal, animator.abortAll]);

                // add Highlighter to note off listeners
                synthesizer.eventHandler.addEvent("noteoff", eventOffID, (event_off) => {
                    if (animator.instrument == null) return;
                    if (event_off.channel == highLighter.channel && event_off.midiNote === highLighter.midiNote) {
                        // console.log(`END animation requested for key ${key.note}${highLighter.id}`);
                        abortSignal.raise();
                    }
                });
            }
        });
    }
}
