import { DATAFOLDER_URL_ABSOLUTE, LOGGING } from "../settings.js";
import { drawInstrument } from "./animation.js";
import { delay, log } from "./utilities.js";

/**
 * Populates a dropdown selector
 * @param {Element} selector the selector element in the document
 * @param {JSON} jsoncontent json structure that describes the selector entries
 * @param {string} key label of the json items containing the value to display in the option's inner HTML.
 * @param {string} value label of the json items containing the value to assign to the 'value' property of the option.
 * @param {int} deletefrom delete existing content starting from given index. (-1 = do not delete existing content)
 */
export function populate_dropdown(selector, jsoncontent, display, attributes, deletefrom = 0) {
    // Remove existing elements
    if (deletefrom >= 0) {
        while (selector.children.length > deletefrom) {
            selector.removeChild(selector.lastChild);
        }
    }
    selector.selectedIndex = 0;
    for (let i = 0; i < jsoncontent.length; i++) {
        let item = jsoncontent[i];
        var option = document.createElement("option");
        attributes.forEach((attr) => option.setAttribute(attr, item[attr]));
        // option.value = item[value];
        option.id = i;
        option.innerHTML = item[display];
        selector.appendChild(option);
    }
}

/**
 * sets the change event for the song selector
 * @param {dictionary of Element} dom DOM elements
 * @param {JSON} json_settings
 */
export function setSongOnChangeEvent(dom, json_settings) {
    // Remove an initial "Select a <type>..." option (if present)
    // as soon as a selection is made by the user.
    let jsonptr = json_settings;
    dom.songSelector.onchange = () => {
        let json = json_settings;
        let selected = dom.songSelector.children[dom.songSelector.selectedIndex];
        if ((selected.id != "_select_") & (dom.songSelector.options[0].id == "_select_")) {
            dom.songSelector.remove(0);
        }
        let idx = selected.id;
        let song = json["songs"][idx];

        // Populate the instrument selector
        let instr_jsoncontent = json["instrumentgroup"][song["instrumentgroup"]];
        populate_dropdown(dom.instrumentSelector, instr_jsoncontent, "name", ["channel"], 1);
        dom.instrumentSelector.selectedIndex = 0;
        dom.instrumentSelector.dispatchEvent(new Event("change")); // Restore individual instrument volume

        // Populate the part selector
        // let firstMember = new Array(new Object({ title: "Entire piece", file: json["songs"][idx]["file"] }));
        // let loopList = firstMember.concat(json["songs"][idx]["loops"]);
        populate_dropdown(dom.partSelector, json["songs"][idx]["parts"], "name", ["file", "loop"], 0);
        dom.partSelector.selectedIndex = 0;
        dom.partSelector.dispatchEvent(new Event("change"));
    };
}

/**
 * Sets the change event for the part selector.
 * @param {AudioContext} context
 * @param {Sequencer} sequencer
 * @param {dictionary of Element} dom
 */
export function setPartOnChangeEvent(context, sequencer, dom) {
    // add an event listener for the part drop-down
    dom.partSelector.addEventListener("change", async (event) => {
        // retrieve the file path for the selected song
        let selection = event.target.options[event.target.selectedIndex];
        let filepath = DATAFOLDER_URL_ABSOLUTE + "/midifiles/".concat(selection.getAttribute("file"));
        console.log(`selected file: ${filepath}`);
        dom.loopCheckbox.checked = selection.getAttribute("loop") === "true";

        // resume the context if paused
        await context.resume();

        const midiFile = await fetch(filepath).then(async (response) => {
            return response.arrayBuffer();
        });

        const parsedSongList = [{ binary: midiFile }];

        document.getElementById("play-icon").innerText = "play_arrow";
        sequencer.loadNewSongList(parsedSongList, false);
        dom.speedSelector.selectedIndex = 0;
        sequencer.loop = dom.loopCheckbox.checked;
        sequencer.pause();

        // make the slider move with the song
        setInterval(() => {
            // slider ranges from 0 to 1000
            dom.audioTimeSlider.value = (sequencer.currentTime / sequencer.duration) * 1000;
        }, 500);
    });
}

/**
 * Sets the change event for the instrument focus selector.
 * @param {Synthetizer} synthesizer
 * @param {JSON} json_settings
 * @param {dictionary of Element} dom DOM elements
 */
function setInstrumentOnChangeEvent(synthesizer, json_settings, dom) {
    dom.instrumentSelector.onchange = () => {
        // let selectedChannel = dom.instrumentSelector.options[dom.instrumentSelector.selectedIndex].value;
        let selectedChannel =
            dom.instrumentSelector.options[dom.instrumentSelector.selectedIndex].getAttribute("channel");
        // Set instrument volumes
        let instrument_index = -1;
        for (let i = 0; i < dom.instrumentSelector.options.length; i++) {
            let option = dom.instrumentSelector.options[i];
            let channel = option.getAttribute("channel");
            // Max volume for focus instruments or for all instruments
            // if "None" is selected (selectedChannel=-1)
            // channel 0 (kempli + gong) should always be loud
            if ((channel == selectedChannel) | (selectedChannel < 0) | (channel == 0)) {
                synthesizer.controllerChange(channel, 7, 127, true);
                if (channel == selectedChannel) {
                    instrument_index = option.id;
                }
            } else {
                synthesizer.controllerChange(channel, 7, 50, true);
            }
        }
        // Initialize animation area for the focus instrument
        self.name = "";
        let instrument = null;
        if ((instrument_index >= 0) & (dom.songSelector.selectedIndex >= 0)) {
            // Look up the instrument information
            let song_index = dom.songSelector.selectedOptions[0].id;
            let song = json_settings["songs"][song_index];
            instrument = json_settings["instrumentgroup"][song["instrumentgroup"]][instrument_index];
        }
        // Draw the animation area or clear it if instrument == null
        // draw_instrument(keyboard, instrument, synthetizer);
        drawInstrument(dom.canvas, instrument, synthesizer);
    };
}

/**
 * Sets the click events of the player control buttons.
 * @param {Sequencer} sequencer
 * @param {dictionary of Element} dom DOM elements
 */
function setPlayPauseStopOnClickEvents(sequencer, dom) {
    const playPauseIcon = dom.playPauseButton.querySelectorAll(".icon")[0];
    dom.playPauseButton.onclick = () => {
        if (sequencer.paused) {
            playPauseIcon.innerText = "pause";
            sequencer.playbackRate = dom.speedSelector.options[dom.speedSelector.selectedIndex].value;
            sequencer.play(); // resume
            delay(10).then(() => {
                // Need to wait until sequencer has actually started
                dom.instrumentSelector.dispatchEvent(new Event("change")); // Restore individual instrument volume
            });
        } else {
            playPauseIcon.innerText = "play_arrow";
            sequencer.pause(); // pause
        }
    };
    // Stop button functionality
    dom.stopButton.onclick = () => {
        // Pause playback and reset playback pointer
        playPauseIcon.innerText = "play_arrow";
        dom.audioTimeSlider.value = 0;
        dom.audioTimeSlider.dispatchEvent(new Event("click")); // redraws slider and resets sequencer time
        sequencer.pause(); // pause
    };
}

/**
 * Initializes events of DOM elements. Parameters from position 3 refer to Element objects.
 * @param {*} sequencer {Sequencer}
 * @param {*} synthesizer {Synthesizer}
 * @param {*} json_settings {json}
 *
 */
export function initializeElementEvents(context, sequencer, synthesizer, json_settings, dom, logfunc) {
    setPartOnChangeEvent(context, sequencer, dom);

    dom.audioTimeSlider.onclick = () => {
        sequencer.currentTime = (dom.audioTimeSlider.value / 1000) * sequencer.duration; // switch the time (the sequencer adjusts automatically)
    };

    // Change playback speed
    dom.speedSelector.onchange = () => {
        if (!sequencer.paused) {
            sequencer.playbackRate = dom.speedSelector.options[dom.speedSelector.selectedIndex].value;
            dom.instrumentSelector.dispatchEvent(new Event("change")); // Restore individual instrument volume
        }
    };

    setInstrumentOnChangeEvent(synthesizer, json_settings, dom);

    setPlayPauseStopOnClickEvents(sequencer, dom);

    dom.loopCheckbox.onclick = () => {
        sequencer.loop = true;
    };
}
