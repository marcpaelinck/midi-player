import { DATAFOLDER_URL_ABSOLUTE } from "../settings.js";
import { Animator } from "./animation.js";
import { delay, log } from "./utilities.js";

let selectedSong = null; // JSON
let selectedInstrument = null; // JSON

/**
 * Initializes events of DOM elements. Parameters from position 3 refer to Element objects.
 * @param {*} sequencer {Sequencer}
 * @param {*} synthesizer {Synthesizer}
 * @param {*} json_settings {json}
 *
 */
export function initializeDropDownsAndEvents(context, sequencer, synthesizer, json_settings, dom, logfunc) {
    populateSongDropdown(json_settings, dom);
    setSongOnChangeEvent(dom, json_settings);
    setPartOnChangeEvent(context, sequencer, dom);

    dom.audioTimeSlider.onchange = () => {
        sequencer.currentTime = (dom.audioTimeSlider.value / 1000) * sequencer.duration; // switch the time (the sequencer adjusts automatically)
        dom.instrumentSelector.dispatchEvent(new Event("change")); // Restore individual instrument volumes.
    };

    // Change playback speed
    dom.speedSelector.onchange = () => {
        if (!sequencer.paused) {
            sequencer.playbackRate = dom.speedSelector.options[dom.speedSelector.selectedIndex].value;
            dom.instrumentSelector.dispatchEvent(new Event("change")); // Restore individual instrument volumes.
        }
    };

    const animator = new Animator(canvas, synthesizer);

    setInstrumentOnChangeEvent(synthesizer, animator, json_settings, dom);
    setPlayPauseStopOnClickEvents(sequencer, dom);

    dom.loopCheckbox.onclick = () => {
        sequencer.loop = true;
    };
}

/**
 * Populates a dropdown selector
 * @param {Element} selector the selector element in the document
 * @param {JSON} jsoncontent json structure that describes the selector entries
 * @param {string} key label of the json items containing the value to display in the option's inner HTML.
 * @param {string} value label of the json items containing the value to assign to the 'value' property of the option.
 * @param {int} deletefrom delete existing content starting from given index. (-1 = do not delete existing content)
 */
function populate_dropdown(selector, jsoncontent, display, attributes, deletefrom = 0) {
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
 * Populates the dropdown with compositions
 * @param {JSON} json_settings
 * @param {Dictionary of Element} dom DOM elements
 */
function populateSongDropdown(json_settings, dom) {
    // Only keep songs that should be displayed
    json_settings["songs"] = json_settings["songs"].filter((song) => song.display);
    populate_dropdown(dom.songSelector, json_settings["songs"], "title", [], 1);
}

/**
 * sets the change event for the song selector
 * @param {dictionary of Element} dom DOM elements
 * @param {JSON} json_settings
 */
function setSongOnChangeEvent(dom, json_settings) {
    // Remove an initial "Select a <type>..." option (if present)
    // as soon as a selection is made by the user.
    dom.songSelector.onchange = () => {
        let json = json_settings;
        let selected = dom.songSelector.children[dom.songSelector.selectedIndex];
        if ((selected.id != "_select_") & (dom.songSelector.options[0].id == "_select_")) {
            dom.songSelector.remove(0);
        }
        let idx = selected.id;
        selectedSong = json["songs"][idx];

        // Populate the instrument selector
        let instr_jsoncontent = json["instrumentgroups"][selectedSong["instrumentgroup"]];
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
function setPartOnChangeEvent(context, sequencer, dom) {
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
            // Slider ranges from 0 to 1000
            dom.audioTimeSlider.value = (sequencer.currentTime / sequencer.duration) * 1000;
            // Display elapsed time
            let mm = Math.floor(sequencer.currentTime / 60);
            let ss = Math.round(sequencer.currentTime - 60 * mm, 0);
            dom.audioTimeDisplay.innerHTML = String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
        }, 500);
    });
}

/**
 * Sets the change event for the instrument focus selector.
 * @param {Synthetizer} synthesizer
 * @param {JSON} json_settings
 * @param {dictionary of Element} dom DOM elements
 */
function setInstrumentOnChangeEvent(synthesizer, animator, json_settings, dom) {
    dom.instrumentSelector.onchange = () => {
        // Do nothing if no song is selected.
        if (selectedSong !== null) {
            // Determine instrument group and selected instrument
            let instrumentgroup = json_settings["instrumentgroups"][selectedSong["instrumentgroup"]];
            let instrument_index = dom.instrumentSelector.selectedIndex;
            if (instrument_index == 0) {
                selectedInstrument = null;
            } else {
                selectedInstrument = instrumentgroup[instrument_index - 1];
            }
            // Set instrument volumes
            instrumentgroup.forEach((instrument) => {
                // Max volume for focus instruments
                // or for all instruments if no focus is selected.
                // Channel 0 (kempli + gong) should always have max volume.
                instrument.channels.forEach((channel) => {
                    if (
                        (channel == 0) | // kempli + gong always loud
                        (selectedInstrument === null) | // No focus selected
                        (selectedInstrument && selectedInstrument.channels.includes(channel))
                    ) {
                        synthesizer.controllerChange(channel, 7, 127, true);
                    } else {
                        synthesizer.controllerChange(channel, 7, 50, true);
                    }
                });
            });
            // Initialize animation area for the focus instrument
            self.name = "";
            animator.set_instrument(selectedInstrument);
            animator.animate();
        }
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
        if (sequencer.hasDummyData) return;
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
        if (sequencer.hasDummyData) return;
        playPauseIcon.innerText = "play_arrow";
        dom.audioTimeSlider.value = 0;
        dom.audioTimeSlider.dispatchEvent(new Event("click")); // redraws slider and resets sequencer time
        sequencer.pause(); // pause
    };
}
