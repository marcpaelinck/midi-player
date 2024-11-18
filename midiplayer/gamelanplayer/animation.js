import { waitForObjectContent, logConsole, loadHTMLContent, delay } from "./utilities.js";

let IdGenerator = 0;

class Key {
    channel;
    note;
    midiNotes;
    strokes;
    highlightScheme; // {stroke => {'color': str, 'cssvariable': str}}
    shape;
    midiToStrokeDict;

    constructor(channel, note, midiNotes, strokes, highlightScheme, shape) {
        this.channel = channel;
        this.channelIndex = this.note = note;
        this.midiNotes = midiNotes.filter((value) => value !== null);
        this.strokes = strokes;
        this.highlightScheme = highlightScheme;
        this.shape = shape;
        this.#createMidiDict(midiNotes);
    }

    /**
     * Creates a dictionary to look up the stroke and highlight color for a given midi note.
     */
    #createMidiDict(midiNotes) {
        this.midiToStrokeDict = {};
        for (let i = 0; i < midiNotes.length; i++) {
            if (midiNotes[i] !== null) this.midiToStrokeDict[midiNotes[i]] = this.strokes[i];
        }
        let x = 1; //dummy for breakpoint
    }

    getStroke(midiNote) {
        return this.midiToStrokeDict[midiNote];
    }

    getHighlightColor(midiNote) {
        return this.highlightScheme[this.midiToStrokeDict[midiNote]]["hlcolor"];
    }

    getCSSVariable(midiNote) {
        return this.highlightScheme[this.midiToStrokeDict[midiNote]]["cssvariable"];
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
    midiNote; // Midi note that is being played.
    channel;
    eventDict; // Dictionary containing the noteoff events of the sythesizer.
    imageDoc;
    highlightTags;
    startAnimation; // Starting time of the highlighter's animation.
    eventOffID = null; // ID of this highlighter's abort event (see below).
    fade_duration = 1000; // Duration of the animation in milliseconds.
    initial_alpha = 1.0;

    constructor(key, midiNote, imageDoc, channel, eventDict) {
        this.id = IdGenerator++;
        this.key = key;
        this.midiNote = midiNote;
        this.imageDoc = imageDoc;
        this.channel = channel;
        this.eventDict = eventDict;
        this.stroke = key.getStroke(midiNote);
        this.highlightTags = ["highlight", this.stroke, key.getCSSVariable(midiNote)];

        this.startAnimation = new Date();
        this.totalframes = 0;
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

    setOpacity(value) {
        // Set the value of variable opacity
        let r = this.imageDoc.querySelector(":root");
        r.style.setProperty("--alpha", value);
        var x = 1;
    }

    setColor() {
        // Set the value of the css variable
        let r = this.imageDoc.querySelector(":root");
        r.style.setProperty(this.key.getCSSVariable(this.midiNote), this.key.getHighlightColor(this.midiNote));
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
        logConsole(`alpha=${alpha} ${highLighter.toStr()}`, "highlight");
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
        logConsole(`start ${highLighter.toStr()}`, "ani-detail");
        do_loop();

        function do_loop() {
            highLighter.off();
            highLighter.on();
            let abort = highLighter.#hilite_frame(highLighter);
            let endloop = abort;
            abortObjects.forEach((signal) => (abort = abort || signal.isRaised()));
            if (!abort) {
                logConsole(`timeout ${highLighter.toStr()}`, "test1");
                window.requestAnimationFrame(do_loop);
            } else {
                highLighter.off();
                highLighter.deleteSynthNoteOffEvent();
                if (abort != endloop) {
                    logConsole(`animation prematurely aborted ${highLighter.toStr()}`, "ani-detail");
                } else {
                    logConsole(
                        `animation terminated normally for ${highLighter.toStr()}', total ${
                            highLighter.totalframes
                        } frames`,
                        "ani-detail"
                    );
                }
            }
        }
    }

    on() {
        let classList = this.key.shape.classList;
        if (!classList.contains("highlight")) {
            logConsole(`setting color to ${this.highlightColor} for ${this.toStr()}`, "ani-detail");
            this.setColor(this.highlightColor);
            delay(50).then(classList.add(...this.highlightTags));
        }
    }

    off() {
        let classList = this.key.shape.classList;
        if (classList.contains(...this.highlightTags)) {
            classList.remove(...this.highlightTags);
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
    midiToKeyDict = null; // dict[channel][midiNote]
    imageDoc = null;
    abortAll;

    constructor(synthesizer, settings) {
        this.synthesizer = synthesizer;
        this.settings = settings;
        this.abortAll = new Abort(false);
        this.midiToKeyDict = {};
        // Set the synthesizer events. Needs to be done only once.
        this.#set_animation_events(this.synthesizer);
        document.getElementById("svg-embed").setH;
        // document.getElementById("svg-embed").onload = this.#process_svg_document();
    }

    /**
     * Returns the key that corresponds with the given MIDI note number
     * and the color that corresponds with the stroke type.
     * @param {number} midiNote
     * @returns Key object.
     */
    getKey(channel, midiNote) {
        if (channel in this.midiToKeyDict) {
            if (midiNote in this.midiToKeyDict[channel]) return this.midiToKeyDict[channel][midiNote];
        }
        return null;
    }

    getHighlightScheme(channelSeq) {
        let scheme = {};
        for (const [stroke, colors] of Object.entries(this.settings.animation.highlight)) {
            let schemeID = channelSeq % colors.length;
            let varID = "";
            if (this.instrument.channels.length > 1) {
                if (colors.length > 1) varID = `${schemeID + 1}`;
            }
            scheme[stroke] = { hlcolor: colors[schemeID], cssvariable: "--color" + varID };
        }
        return scheme;
    }

    /**
     * Initializes the animator for the given instrument.
     * @param {JSON} instrument Contains information about the instrument.
     */
    set_instrument(instrument) {
        this.instrument = instrument;
        document.getElementById("svg-embed").innerHTML = "";
        if (instrument == null) return;
        if (instrument["animation"] == null) return;

        // Populate the keys collection
        // Load the animation picture
        let animationProfile = this.settings.animation.profiles[instrument.animation];
        let svcFile = this.settings.datafolder + "/animation/" + animationProfile.file;
        let embed_div = document.getElementById("svg-embed");
        loadHTMLContent(embed_div, svcFile).then((response) => {
            this.#process_svg_document(response);
        });
    }

    #process_svg_document(response) {
        console.log(response);
        if (this.instrument == null) return;
        this.imageDoc = document;

        // Create Key objects
        let animationHighlight = this.settings.animation.highlight;
        let animationProfile = this.settings.animation.profiles[this.instrument.animation];
        let channels = this.instrument.channels;
        for (let channelSeq = 0; channelSeq < channels.length; channelSeq++) {
            let channel = channels[channelSeq];
            for (const [note, midiNotes] of Object.entries(animationProfile.notes)) {
                if (note !== null) {
                    let key = new Key(
                        channel,
                        note,
                        midiNotes,
                        animationProfile.strokes,
                        this.getHighlightScheme(channelSeq),
                        this.imageDoc.getElementById(note)
                    );
                    // Update midiToKeyDict for quick lookup
                    for (const [midiNote, ignore] of Object.entries(key.midiToStrokeDict)) {
                        if (!(channel in this.midiToKeyDict)) {
                            this.midiToKeyDict[channel] = {};
                        }
                        this.midiToKeyDict[channel][midiNote] = key;
                    }
                }
            }
        }
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
            if (animator.instrument["channels"].includes(event_on.channel)) {
                let key = animator.getKey(event_on.channel, event_on.midiNote);
                if (key !== null) {
                    let highLighter = new Highlighter(
                        key,
                        event_on.midiNote,
                        animator.imageDoc,
                        event_on.channel,
                        synthesizer.eventHandler.events["noteoff"]
                    );
                    logConsole(`note_on ${highLighter.toStr()}`, "ani-detail");
                    let abortSignal = new Abort(false);
                    let eventOffID = `animation${highLighter.id}`;
                    highLighter.setEventOffID(eventOffID);
                    highLighter.start_hilite([abortSignal, animator.abortAll]);

                    // add Highlighter to note off listeners
                    synthesizer.eventHandler.addEvent("noteoff", eventOffID, (event_off) => {
                        if (animator.instrument == null) return;
                        if (event_off.channel == highLighter.channel && event_off.midiNote === highLighter.midiNote) {
                            logConsole(`note_off ${highLighter.toStr()}`, "ani-detail");
                            highLighter.off();
                            abortSignal.raise();
                        }
                    });
                }
            }
        });
    }
}
