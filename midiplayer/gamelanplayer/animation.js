import { waitForSVGDocLoaded, logConsole } from "./utilities.js";

const colorClear = "rgb(255, 255, 255)";
const colorBorder = "black";
const colorGold = "rgb(255, 215, 0)";
const colorGoldLight = "rgb(255, 243, 178)";
const colorDefault = colorGoldLight;
const colorHilite = ["green", "blue", "purple"];
const CIRCLE = "circle";
const RECTANGLE = "rectangle";
const TRAPEZE = "trapeze";

let IdGenerator = 0;

class Key {
    note;
    midiNotes;
    strokes;
    shape;

    constructor(note, midiNotes, strokes, shape) {
        this.note = note;
        this.midiNotes = midiNotes;
        this.strokes = strokes;
        this.shape = shape;
    }

    getStroke(midiNote) {
        let idx = this.midiNotes.indexOf(midiNote);
        if (idx >= 0 && idx < this.strokes.length) {
            return this.strokes[idx];
        }
        return null;
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
    key; // Key object that should be highlighted.
    hiliteColor;
    midiNote; // Midi note that is being played.
    channel;
    eventDict; // Dictionary containing the noteoff events of the sythesizer.
    imageDoc;
    startAnimation; // Starting time of the highlighter's animation.
    eventOffID = null; // ID of this highlighter's abort event (see below).
    fade_duration = 1000; // Duration of the animation in milliseconds.
    initial_alpha = 0.7;

    constructor(key, midiNote, hiliteColor, imageDoc, channel, eventDict) {
        this.id = IdGenerator++;
        this.key = key;
        this.midiNote = midiNote;
        this.hiliteColor = hiliteColor;
        this.imageDoc = imageDoc;
        this.channel = channel;
        this.eventDict = eventDict;
        this.stroke = key.getStroke(midiNote);
        this.startAnimation = new Date();
    }

    toStr() {
        return `id=${this.id} midi=${this.midiNote} note=${this.key.note}-${this.stroke}`;
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
        return Math.max(this.initial_alpha * (1 - elapsedMillis / this.fade_duration), 0);
    }

    // Create a function for setting a variable value
    setOpacity(value) {
        // Set the value of variable --blue to another value (in this case "lightblue")
        let r = this.imageDoc.querySelector(":root");
        // r.style.setProperty("--opacity", `${value}`);
        // getComputedStyle(r).setProperty("--alpha", value);
        r.style.setProperty("--alpha", value);
        var x = 1;
    }

    // Create a function for setting a variable value
    setColor(value) {
        // Set the value of variable --blue to another value (in this case "lightblue")
        let r = this.imageDoc.querySelector(":root");
        r.style.setProperty("--color", value);
        var x = 1;
    }

    /**
     * Determines a single frame of the animation.
     * @returns true if this is the last frame of the animation.
     */
    #hilite_frame(highLighter) {
        // Draw a non-highlighted key
        // Draw the hilite on top of the default color.
        let alpha = this.currentAlpha();
        // logConsole(`alpha=${alpha} ${highLighter.toStr()}`);
        if (alpha > 0) this.setOpacity(alpha);
        return alpha <= 0;
    }

    /**
     * Performs the highlighting animation.
     * The animation can be aborted by setting the abort status of an Abort object in the list.
     * @param {Abort[]} abortObjectList List of abort objects to listen to.
     */
    start_hilite(abortObjectList) {
        let highLighter = this;
        let abortObjects = abortObjectList;
        logConsole(`start ${highLighter.toStr()}`);
        do_loop();

        function do_loop() {
            highLighter.on();
            let abort = highLighter.#hilite_frame(highLighter);
            let endloop = abort;
            abortObjects.forEach((signal) => (abort = abort || signal.isRaised()));
            if (abort != endloop) {
                logConsole(`aborted ${highLighter.toStr()}`);
            }
            if (!abort) {
                window.requestAnimationFrame(do_loop);
            } else {
                highLighter.off();
                highLighter.deleteSynthNoteOffEvent();
                logConsole(`end ${highLighter.toStr()}`);
            }
        }
    }

    on() {
        let classList = this.key.shape.classList;
        if (!classList.contains("highlight")) {
            this.setColor(this.hiliteColor);
            classList.add("highlight");
        }
    }
    off() {
        let classList = this.key.shape.classList;
        if (classList.contains("highlight")) {
            classList.remove("highlight");
            this.setOpacity(1);
        }
    }
}

/**
 * Coordinates the animation.
 * Draws the inital layout and creates event listeners for the synthesizer.
 */
export class Animator {
    synthesizer = null;
    settings = null;

    instrument = null;
    keys = null;
    animatednotes = null;
    imageDoc = null;
    abortAll;

    constructor(synthesizer, settings) {
        this.synthesizer = synthesizer;
        this.settings = settings;
        this.abortAll = new Abort(false);
        // Set the synthesizer events. Needs to be done only once.
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
        let key = this.keys.find((k) => k.midiNotes.includes(midiNote));
        // TODO raise error if key is null
        let idx = key.midiNotes.indexOf(midiNote);
        // let key = this.keys[(midiNote - 1 - this.instrument.midioffset) % this.keys.length];
        let hiliteColor = colorHilite[idx];
        return [key, hiliteColor];
    }

    /**
     * Initializes the animator for the given instrument.
     * @param {JSON} instrument Contains information about the instrument.
     */
    set_instrument(instrument) {
        this.instrument = instrument;
        document.getElementById("svg-embed").setAttribute("src", "");
        if (instrument == null) return;
        if (instrument["animation"] == null) return;

        // Populate the keys collection
        this.keys = [];
        this.animatednotes = [];
        // Load the animation picture
        let animationInfo = this.settings.animation[instrument.animation];
        let svcFile = this.settings.datafolder + "/animation/" + animationInfo.file;
        document.getElementById("svg-embed").setAttribute("src", svcFile);
        waitForSVGDocLoaded("svg-embed").then(() => {
            this.imageDoc = document.getElementById("svg-embed").getSVGDocument();

            // Create Key objects
            for (const [note, midiNotes] of Object.entries(animationInfo.notes)) {
                if (note !== null) {
                    let key = new Key(note, midiNotes, animationInfo.strokes, this.imageDoc.getElementById(note));
                    this.keys.push(key);
                    this.animatednotes.push(...key.midiNotes);
                }
            }
        });
    }

    /**
     * Starts the animation by drawing the initial layout.
     * The synthesizer events will take care of the highlighting animation.
     * If
     */
    animate() {
        // Clear existing animation events
        this.abortAll.raise();
        // No instrument focus selected
        if (this.instrument == null) return;

        // TODO: enable non-consecutive note indices)
        this.abortAll.clear();
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
            if (
                animator.instrument["channels"].includes(event_on.channel) &&
                animator.animatednotes.includes(event_on.midiNote)
            ) {
                let [key, color] = animator.getKeyAndColor(event_on.midiNote);
                //key, hiliteColor, midiNote, channel, eventDict
                let highLighter = new Highlighter(
                    key,
                    event_on.midiNote,
                    color,
                    animator.imageDoc,
                    event_on.channel,
                    synthesizer.eventHandler.events["noteoff"]
                );
                logConsole(`note_on ${highLighter.toStr()}`);
                // console.log(`animation requested for key ${key.note}${highLighter.id}`);
                let abortSignal = new Abort(false);
                let eventOffID = `animation${highLighter.id}`;
                highLighter.setEventOffID(eventOffID);
                highLighter.start_hilite([abortSignal, animator.abortAll]);

                // add Highlighter to note off listeners
                synthesizer.eventHandler.addEvent("noteoff", eventOffID, (event_off) => {
                    if (animator.instrument == null) return;
                    if (event_off.channel == highLighter.channel && event_off.midiNote === highLighter.midiNote) {
                        logConsole(`note_off ${highLighter.toStr()}`);
                        // console.log(`END animation requested for key ${key.note}${highLighter.id}`);
                        abortSignal.raise();
                    }
                });
            }
        });
    }
}
