import { DATAFOLDER_URL_ABSOLUTE } from "../settings.js";
import { delay, logConsole, timeFormat } from "./utilities.js";
import { createAnimator } from "./animation.js";
import { Synthetizer } from "../spessasynth_lib/synthetizer/synthetizer.js";

var selectedSong = null; // JSON
var selectedInstrument = null; // JSON
export var selectedSpeed = 1;
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
        let sequencer_paused = sequencer.paused;
        sequencer.currentTime = (dom.audioTimeSlider.value / 1000) * sequencer.duration; // switch the time (the sequencer adjusts automatically)
        // Changing the sequencer time unpauses it.
        if (sequencer_paused) sequencer.pause();
        restoreInstrumentVolumes(synthesizer, json_settings); // Restore individual instrument volumes.
    };

    dom.audioTimeSlider.onmousedown = () => {
        // Disables automatic updating of the slider value
        dom.audioTimeSlider.toggleAttribute("userinteraction", true);
    };

    dom.audioTimeSlider.onmouseup = () => {
        // Enables automatic updating of the slider value
        dom.audioTimeSlider.toggleAttribute("userinteraction", false);
    };

    // Change playback speed
    dom.speedSelector.onchange = () => {
        if (!sequencer.paused) {
            selectedSpeed = dom.speedSelector.options[dom.speedSelector.selectedIndex].value;
            sequencer.playbackRate = selectedSpeed;
            restoreInstrumentVolumes(synthesizer, json_settings); // Restore individual instrument volumes.
        }
    };

    const animator = createAnimator(synthesizer, sequencer, json_settings, dom);

    setInstrumentOnChangeEvent(synthesizer, animator, json_settings, dom);
    setPlayPauseStopOnClickEvents(synthesizer, sequencer, json_settings, dom);

    dom.loopCheckbox.onclick = () => {
        sequencer.loop = dom.loopCheckbox.checked;
    };

    // make the slider move with the song
    setInterval(() => {
        if (dom.audioTimeSlider.hasAttribute("userinteraction")) {
            // Display slider value being set by user (as an elapsed time value).
            dom.audioTimeDisplay.innerHTML = timeFormat(
                (dom.audioTimeSlider.value / dom.audioTimeSlider.max) * sequencer.duration
            );
        } else {
            // Only update slider value to reflect sequencer progress if user is not interacting with it.
            dom.audioTimeSlider.value = (sequencer.currentTime / sequencer.duration) * dom.audioTimeSlider.max;
            // Display elapsed time.
            dom.audioTimeDisplay.innerHTML = timeFormat(sequencer.currentTime);
        }
    }, 100);
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
 * Adds option elements to the datalist element of the player's progress bar/slider
 * @param {*} markers the markers as a dictionary {partname: percentage} where percentage is relative to the total duration.
 */
function populate_slider_markers(markers, dom) {
    let increment = 2;
    const maxValue = dom.audioTimeSlider.max;

    function nextEntry(markerEntries) {
        if (markerEntries.length > 0) {
            let [part_name, fraction_of_total_time] = markerEntries.shift();
            let time_value = Math.round(fraction_of_total_time * maxValue);
            let nearest_label_position = increment * Math.round((fraction_of_total_time * 100) / increment);
            return [part_name, time_value, nearest_label_position];
        } else {
            return [null, null, null];
        }
    }

    let markerEntries = Object.entries(markers);
    dom.audioTimeSliderMarkers.innerHTML = "";

    if (markerEntries.length > 0) {
        let [part_name, time_value, nearest_label_position] = nextEntry(markerEntries);
        // Create labels that are evenly distributed over the progress bar and fill in
        // the ones that correspond with the required markers.
        // This is the most secure and simple way (that I know of) to position the labels correctly.
        for (let i = 0; i <= 100; i += increment) {
            let option = document.createElement("option");
            option.setAttribute("id", `tick${i}`);
            option.setAttribute("label", "");
            if (i == nearest_label_position) {
                option.setAttribute("value", `${time_value}`);
                option.setAttribute("label", part_name);
                [part_name, time_value, nearest_label_position] = nextEntry(markerEntries);
            }
            dom.audioTimeSliderMarkers.appendChild(option);
        }
    }
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
        populate_dropdown(dom.instrumentSelector, instr_jsoncontent, "label", ["channel"], 1);
        dom.instrumentSelector.selectedIndex = 0;
        dom.instrumentSelector.dispatchEvent(new Event("change")); // Restore individual instrument volume

        // Populate the part selector
        // let firstMember = new Array(new Object({ title: "Entire piece", file: json["songs"][idx]["file"] }));
        // let loopList = firstMember.concat(json["songs"][idx]["loops"]);
        populate_dropdown(dom.partSelector, json["songs"][idx]["parts"], "part", ["part", "file", "loop"], 0);
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
    const play_icon = "\u{25B6}";
    dom.partSelector.addEventListener("change", async (event) => {
        // retrieve the file path for the selected song
        let selection = event.target.options[event.target.selectedIndex];
        let filepath = DATAFOLDER_URL_ABSOLUTE + "/midifiles/".concat(selection.getAttribute("file"));
        let partname = selection.getAttribute("part");
        logConsole(`selected file: ${filepath}`, "always");
        dom.loopCheckbox.checked = selection.getAttribute("loop") === "true";
        let selected_part = selectedSong.parts.find((part) => part.part == partname);
        populate_slider_markers(selected_part.markers, dom);

        // resume the context if paused
        await context.resume();

        const midiFile = await fetch(filepath).then(async (response) => {
            return response.arrayBuffer();
        });

        const parsedSongList = [{ binary: midiFile }];

        document.getElementById("play-icon").innerText = play_icon;
        sequencer.loadNewSongList(parsedSongList, false);
        dom.speedSelector.selectedIndex = 0;
        selectedSpeed = 1;
        sequencer.loop = dom.loopCheckbox.checked;
        sequencer.pause();
    });
}

export function restoreInstrumentVolumes(synthesizer, json_settings) {
    if (selectedSong !== null) {
        // Determine instrument group and selected instrument
        let instrumentgroup = json_settings["instrumentgroups"][selectedSong["instrumentgroup"]];
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
    }
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
            // animator.animate();
        }
    };
}

/**
 * Sets the click events of the player control buttons.
 * @param {Synthetizer} synthesizer
 * @param {Sequencer} sequencer
 * @param {JSON} json_settings
 * @param {dictionary of Element} dom DOM elements
 */
function setPlayPauseStopOnClickEvents(synthesizer, sequencer, json_settings, dom) {
    const playPauseIcon = dom.playPauseButton.querySelectorAll(".icon")[0];
    const play_icon = "\u{25B6}";
    const pause_icon = "\u{23F8}";
    dom.playPauseButton.onclick = () => {
        if (sequencer.hasDummyData) return;
        if (sequencer.paused) {
            playPauseIcon.innerText = pause_icon;
            sequencer.playbackRate = selectedSpeed;
            sequencer.play(); // resume
            delay(10).then(() => {
                // Need to wait until sequencer has actually started
                restoreInstrumentVolumes(synthesizer, json_settings); // Restore individual instrument volume
            });
        } else {
            playPauseIcon.innerText = play_icon;
            sequencer.pause(); // pause
        }
    };
    // Stop button functionality
    dom.stopButton.onclick = () => {
        // Pause playback and reset playback pointer
        if (sequencer.hasDummyData) return;
        sequencer.currentTime = 0;
        sequencer.pause();
        playPauseIcon.innerText = play_icon;
        dom.audioTimeSlider.value = 0;
    };
}
