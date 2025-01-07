import { logConsole, loadHTMLContent, delay, fetchJSONData } from "./utilities.js";
import { messageTypes } from "../spessasynth_lib/midi_parser/midi_message.js";
import { DATAFOLDER_URL_ABSOLUTE } from "../settings.js";

let IdGenerator = 0;

class Key {
    channel;
    note;
    midiToRGBStrokeLookup;
    midiToStrokeLookup;
    shape;
    xpos = none;

    constructor(channel, midinote, midiToRGBStrokeLookup, shape) {
        this.channel = channel;
        this.note = midinote;
        this.midiToRGBStrokeLookup = midiToRGBStrokeLookup;
        this.shape = shape;
        if (shape.querySelector(".x")) {
            var value = shape.querySelector(".x").attributes.value.value;
            this.xpos = Number(value);
        }
    }

    /**
     * Returns the highlighting color for the given midi note. I haven't found out (yet)
     * how to animate the fill-opacity of SVG shapes directly. So this is what I came up with.
     * @param {*} midiNote
     * @param {*} alpha
     * @returns
     */
    getHighlightColor(midiNote, alpha) {
        var rgb = this.midiToRGBStrokeLookup[midiNote].color;
        return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    }

    getShape(midiNote) {
        var shape = this.shape.querySelector(`.${this.midiToRGBStrokeLookup[midiNote].stroke}`);
        if (shape) return shape;
        return this.shape;
    }
}

class HelpingHand {
    disabled = false;
    shape = null;
    Xvalues = {};
    Yvalues = {};
    animationValues = {};
    prevnote = null;

    // Animation constants
    moveToDuration = 500; // duration of the movement to the next key
    strikeDuration = 600; // duration of the stroke
    bezier = "cubic-bezier(0,.25,1,.71)"; // default timing curve
    bezierStroke = "cubic-bezier(.99,-0.01,1,.51)"; // timing curve for stroke (accelerates toward stroke)

    constructor(shapeGroup) {
        this.shape = shapeGroup.querySelector(".helpinghand");
        var data_x = shapeGroup.querySelector("data.x");
        var data_y = shapeGroup.querySelector("data.y");
        var data_animation = shapeGroup.querySelector("data.animation");
        if (!this.shape || !data_x || !data_y || !data_animation) {
            logConsole("Disabling 'Helping Hand': no shape found in the SVG file or missing animation data.", "always");
            this.disabled = true;
            return;
        }
        this.Xvalues = JSON.parse(data_x.attributes.value.value);
        this.Yvalues = JSON.parse(data_y.attributes.value.value);
        this.animationValues = JSON.parse(data_animation.attributes.value.value);
        this.prevnote = Object.keys(this.Xvalues)[0]; // starting point is leftmost key
    }

    // #calculate_path(from_x, to_x) {
    //     return `C${from_x} ${this.Yvalues.min} ${to_x} ${this.Yvalues.min} ${this.Yvalues.max} ${this.Yvalues.max}`;
    // }

    /**
     * Moves the Helping Hand symbol to the next note and animates the stroke. The data for the animation is passed as
     * a JSON object from a text message that is passed by the MIDI sequencer. These messages occur with each "note_start"
     * message. Example:
     * {"id": 1, "type": "helpinghand", "position": "CALUNG", "pitch": "DUNG", "octave": 1, "timeuntil": 1125.0, "islast": false}
     * 'timeuntil' is the time until the next key (pitch/octave) should be struck.
     * All time durations are in ms.
     *
     * @param {JSON} noteinfo Data for the animation of the Helping Hand.
     * @returns none
     */
    moveToNextKey(noteinfo) {
        if (this.disabled) return;

        // The animation starts with the mallet in 'down' position, right after the previous key has been struck.
        // The animation consists of three movements:
        // 1. Move to the next key while lifiting the mallet (duration: this.moveToDuration)
        // 2. Hover over the new key until the start of the stroke (Only if there is time left between steps 1 and 3)
        // 3. Strike the key (combination of horizontal+vertical movement and rotation) (duration: this.strikeDuration)
        // If 'timeuntil' is shorter than the total duration of 1 and 3, both durations are reduced to fit within "timeuntil".
        // If 'timeuntil' is longer, the remaining idle time is animated in step 2 (slight movement or 'hover' for a 'smooth' animation)
        var keyframes, options;

        if (noteinfo.islast) {
            // Final animation: lift the hammer.
            keyframes = [
                {
                    transform: `translate(${this.Xvalues[this.prevnote] + this.animationValues.stroke_x}px, ${
                        this.Yvalues.y + this.animationValues.stroke_y
                    }px) rotate(${this.animationValues.stroke_rotation}deg) scale(1, 1)`,
                    offset: 0,
                },
                // Step 1: move to (almost) the next note minus x_idle_offset horizontal units. These will be used in step 2.
                {
                    transform: `translate(${this.Xvalues[this.prevnote]}px, ${this.Yvalues.y}px) rotate(0)`,
                    offset: 1,
                },
            ];
            options = {
                duration: this.strikeDuration,
                fill: "forwards",
                easing: this.bezier,
                composite: "replace",
            };
            this.prevnote = null;
        } else {
            var timeToNextNote = noteinfo.timeuntil;
            var key = `${noteinfo.pitch}${noteinfo.octave}`; // E.g. 'DONG1'. This uniquely identifies a key
            // Convert time durations to fractions (keyframe time indicators run from 0 to 1)
            var move_to_fraction = this.moveToDuration / timeToNextNote;
            var stroke_fraction = this.strikeDuration / timeToNextNote;
            var total_movement_frac = move_to_fraction + stroke_fraction;
            var idle_time_fraction;
            // Reduce the animation times if needed and calculate idle time.
            if (total_movement_frac > 1) {
                move_to_fraction /= total_movement_frac;
                stroke_fraction /= total_movement_frac;
                idle_time_fraction = 0;
            } else {
                idle_time_fraction = 1 - move_to_fraction - stroke_fraction;
            }

            // this.shape.style.offset = this.#calculate_path(this.Xvalues[this.prevnote], this.Xvalues[key]);
            logConsole(`prevnote=${this.prevnote} note=${key}`, "helpinghand");
            logConsole(
                `translateX(${this.Xvalues[this.prevnote]}px), translateX(${this.Xvalues[key]}px)`,
                "helpinghand"
            );
            logConsole(
                `tot_time=${timeToNextNote}, moveX=${move_to_fraction}, idle=${idle_time_fraction}, strike=${stroke_fraction}`,
                "helpinghand"
            );
            // Set the hover X direction equal to that of the movement between the keys
            var hover_x = -Math.sign(this.Xvalues[key] - this.Xvalues[this.prevnote]) * this.animationValues.hover_x;
            if (idle_time_fraction * timeToNextNote < 200) hover_x = 0;

            keyframes = [
                // Start where the previous animation ended: the moment the key is struck
                {
                    transform: `translate(${this.Xvalues[this.prevnote] + this.animationValues.stroke_x}px, ${
                        this.Yvalues.y + this.animationValues.stroke_y
                    }px) rotate(${this.animationValues.stroke_rotation}deg) scale(1, 1)`,
                    offset: 0,
                },
                // Step 1: move to (almost) the next note minus x_idle_offset horizontal units. These will be used in step 2.
                {
                    transform: `translate(${this.Xvalues[key] + hover_x}px, ${this.Yvalues.y}px) rotate(0)`,
                    offset: move_to_fraction,
                },
                // Step 2: wait until strike movement. Hover by moving horizontally over x_idle_offset units.
                {
                    transform: `translate(${this.Xvalues[key]}px, ${this.Yvalues.y}px)`,
                    offset: move_to_fraction + idle_time_fraction,
                    easing: this.bezierStroke,
                },
                // Step 3: strike down (combination of rotation, movement and scaling)
                {
                    transform: `translate(${this.Xvalues[key] + this.animationValues.stroke_x}px, ${
                        this.Yvalues.y + this.animationValues.stroke_y
                    }px) rotate(${
                        this.animationValues.stroke_rotation
                    }deg) scale(${this.animationValues.stroke_scale.toString()})`,
                    offset: 1,
                },
            ];
            options = { duration: timeToNextNote, fill: "forwards", easing: this.bezier, composite: "replace" };
            this.prevnote = key;
        }

        this.shape.animate(keyframes, options).finished.then((a) => {
            try {
                logConsole(JSON.stringify(this.shape.style), "helpinghand");
                a.commitStyles(); // Persist the final position of the animation
            } catch (exception) {
                // Happens when user switches intrument during animation: animation's target does not exist any more
                logConsole("switching instrument during animation", "helpinghand");
            }
            a.cancel();
        });
    }
}

/**
 * Coordinates the animation.
 * Draws the inital layout and creates event listeners for the synthesizer.
 */
export class Animator {
    synthesizer = null;
    sequencer = null;
    settings = null;
    dom = null;
    colorDict = null;

    instrument = null;
    keys = null;
    midiToKeyDict = null; // dict[channel][midiNote]
    imageDoc = null;
    highlightAnimations = {}; // dict[channel][midiNote] contains 'running' Animation objects
    helpingHand = null;

    constructor(synthesizer, sequencer, settings, dom) {
        this.synthesizer = synthesizer;
        this.sequencer = sequencer;
        this.settings = settings;
        this.dom = dom;
        fetchJSONData(DATAFOLDER_URL_ABSOLUTE + "/animation/colors.json").then((response) => {
            this.colorDict = response;
        });
        this.midiToKeyDict = {};
        // Set the synthesizer events. Needs to be done only once.
        this.#set_animation_events(this.synthesizer);
        document.getElementById("svg-embed").setH;
        // document.getElementById("svg-embed").onload = this.#process_svg_document();
    }

    /**
     * Returns the key that corresponds with the given MIDI note number
     * @param {number} midiNote
     * @returns Key object.
     */
    getKey(channel, midiNote) {
        if (channel in this.midiToKeyDict) {
            if (midiNote in this.midiToKeyDict[channel]) return this.midiToKeyDict[channel][midiNote];
        }
        return null;
    }

    /**
     * Creates a dict midi-value => [r, g, b] for a specific instrument key (daun).
     * The method combines four lists/dicts:
     * 1. midiNotes: list of midi values that correspond with the instrument key
     * 2. strokes: list of strokes that correspond with each midi value in midiNotes
     * 3. this.settings.animation.highlight: dict stroke => [color1 (, color2, ...)] set of colors for each stroke.
     *    This dict can contain multiple colors for the same stroke. This enables to use different colors
     *    when several positions are animated on the same instrument. If there are less colors than positions, the
     *    method loops throught the list of available colors.
     * 4. colorDict: color-name => [r, g, b].
     *    This translation is needed for the Key.getHighlightColor method.
     * @param {*} channelSeq
     * @param {*} midiNotes
     * @param {*} animationProfile
     * @returns
     */
    getMidiToRGBStrokeLookup(channelSeq, midiNotes, strokes) {
        let scheme = {};
        for (var i = 0; i < midiNotes.length; i++) {
            var stroke = strokes[i];
            var colors = this.settings.animation.highlight[stroke];
            // color_id loops through the list of available colors for this stroke.
            var color_id = channelSeq % colors.length;
            var midiNote = midiNotes[i];
            var stroke = strokes[i];
            var highlightColor = colors[color_id];
            scheme[midiNote] = { color: this.colorDict[highlightColor], stroke: stroke };
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
        this._setPanggulCheckboxIsVisible(false);
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

    _setPanggulCheckboxIsVisible(value) {
        if (value) {
            this.dom.panggulSelectorForm.style.visibility = "visible";
        } else {
            this.dom.panggulSelectorForm.style.visibility = "hidden";
        }
    }

    #process_svg_document(response) {
        console.log(response);
        if (this.instrument == null) return;

        this.imageDoc = document;

        // Create Key objects
        let animationProfile = this.settings.animation.profiles[this.instrument.animation];
        let channels = this.instrument.channels;
        for (let channelSeq = 0; channelSeq < channels.length; channelSeq++) {
            let channel = channels[channelSeq];
            for (const [note, midiNotes] of Object.entries(animationProfile.notes)) {
                if (note !== null) {
                    let key = new Key(
                        channel,
                        note,
                        this.getMidiToRGBStrokeLookup(channelSeq, midiNotes, animationProfile.strokes),
                        this.imageDoc.getElementById(note)
                    );
                    // Update midiToKeyDict for quick lookup
                    for (const [midiNote, ignore] of Object.entries(key.midiToRGBStrokeLookup)) {
                        if (!(channel in this.midiToKeyDict)) {
                            this.midiToKeyDict[channel] = {};
                        }
                        this.midiToKeyDict[channel][midiNote] = key;
                    }
                }
            }
        }
        var helpingHandShape = document.getElementById("helpinghand");
        if (helpingHandShape) {
            this.helpingHand = new HelpingHand(helpingHandShape);
            this._setPanggulCheckboxIsVisible(true);
            this.dom.panggulCheckbox.onclick();
        } else {
            this._setPanggulCheckboxIsVisible(false);
        }
    }

    /**
     * Adds synthesizer noteon/noteoff events to highlight the corresponding key on the canvas.
     * @param {Synthetizer} synthesizer
     * @param {Sequencer} sequencer
     */
    #set_animation_events() {
        const animator = this;
        const bezier = "cubic-bezier(0,.99,1,.87)"; // Describes the decrease of the alpha component of the fading

        this.dom.panggulCheckbox.onclick = () => {
            if (!this.helpingHand) return; // shouldn't happen: checkbox should be hidden if helping hand is none
            if (this.dom.panggulCheckbox.checked) {
                this.helpingHand.shape.style.visibility = "visible";
            } else {
                this.helpingHand.shape.style.visibility = "hidden";
            }
        };

        //note on:  create new highlighting animation.
        animator.synthesizer.eventHandler.addEvent("noteon", "key_animation", (event_on) => {
            if (animator.instrument == null) return;
            if (animator.instrument["channels"].includes(event_on.channel)) {
                if (!(event_on.channel in animator.highlightAnimations)) {
                    animator.highlightAnimations[event_on.channel] = {};
                }

                let key = animator.getKey(event_on.channel, event_on.midiNote);
                if (key !== null) {
                    const highlightColorAlpha1 = key.getHighlightColor(event_on.midiNote, 1);
                    const highlightColorAlpha0 = key.getHighlightColor(event_on.midiNote, 0);
                    var highlightKeyframes = new KeyframeEffect(
                        key.getShape(event_on.midiNote),
                        [
                            { fill: highlightColorAlpha1, offset: 0, easing: bezier },
                            { fill: highlightColorAlpha0, offset: 1, easing: bezier },
                        ],
                        { duration: 1000 }
                    );
                    var animation = new Animation(highlightKeyframes, document.timeline);
                    animator.highlightAnimations[event_on.channel][event_on.midiNote] = animation;
                    animation.id = `note=${event_on.midiNote}`;
                    logConsole(`Start highlight ${animation.id}`, "highlighting");
                    logConsole(
                        `    Active animations: ${JSON.stringify(animator.highlightAnimations)}`,
                        "highlighting"
                    );
                    animation.play();
                }
            }
        });

        // note off: cancel highlighting animation.
        animator.synthesizer.eventHandler.addEvent("noteoff", "key_animation", (event_off) => {
            if (animator.instrument == null) return;
            if (event_off.channel in animator.highlightAnimations) {
                if (event_off.midiNote in animator.highlightAnimations[event_off.channel]) {
                    var animation = animator.highlightAnimations[event_off.channel][event_off.midiNote];
                    if (animation != null) {
                        logConsole(`Cancelling ${animation.id}`, "highlighting");
                        logConsole(
                            `     Active animations before cancelling: ${JSON.stringify(animator.highlightAnimations)}`,
                            "highlighting"
                        );
                        animation.cancel();
                        delete animator.highlightAnimations[event_off.channel][event_off.midiNote];
                        logConsole(
                            `     Remaining active animations after cancelling: ${JSON.stringify(
                                animator.highlightAnimations
                            )}`,
                            "highlighting"
                        );
                    }
                }
            }
        });

        // Helping hand animation
        animator.sequencer.onTextEvent = (t1, t2) => {
            // Animation of the 'Helping hand' are triggered by marker metamessages.
            if (animator.instrument == null) return;
            var text = new TextDecoder().decode(t1);
            if ((t2 == messageTypes.marker) & text.startsWith("{")) {
                var message = JSON.parse(text);
                if (
                    ("type" in message) &
                    (message.type == "helpinghand") &
                    (message.position == animator.instrument.group)
                ) {
                    animator.helpingHand.moveToNextKey(message);
                }
            }
        };
    }
}

var ANIMATOR = none;
export function createAnimator(synthesizer, sequencer, json_settings, dom) {
    ANIMATOR = new Animator(synthesizer, sequencer, json_settings, dom);
    return ANIMATOR;
}
