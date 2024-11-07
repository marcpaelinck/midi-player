/**
 * Populates a dropdown selector
 * @param {*} selector the selector element in the document
 * @param {*} jsoncontent json structure that describes the selector entries
 * @param {*} key label of the json items containing the value to display in the option's inner HTML.
 * @param {*} value label of the json items containing the value to assign to the 'value' property of the option.
 * @param {*} deletefrom delete existing content starting from given index. (-1 = do not delete existing content)
 */
export function populate_dropdown(selector, jsoncontent, key, value, deletefrom = 0) {
    // Remove existing elements
    if (deletefrom >= 0) {
        while (selector.children.length > deletefrom) {
            selector.removeChild(selector.lastChild);
        }
    }
    selector.selectedIndex = 0;
    for (let i = 0; i < jsoncontent.length; i++) {
        let item = jsoncontent[i];
        // Skip keys starting with underscore
        var option = document.createElement("option");
        option.value = item[value];
        option.id = i;
        option.innerHTML = item[key];
        selector.appendChild(option);
    }
}

export function setSongOnChangeEvent(songSelector, partSelector, instrumentSelector, json) {
    // Remove an initial "Select a <type>..." option (if present)
    // as soon as a selection is made by the user.
    let jsonptr = json;
    songSelector.onchange = () => {
        let json = jsonptr;
        let selected = songSelector.children[songSelector.selectedIndex];
        if ((selected.id != "_select_") & (songSelector.options[0].id == "_select_")) {
            songSelector.remove(0);
        }
        let idx = selected.id;
        let song = json["songs"][idx];

        // Populate the instrument selector
        let instr_jsoncontent = json["instrumentgroup"][song["instrumentgroup"]];
        populate_dropdown(instrumentSelector, instr_jsoncontent, "name", "channel", 1);
        instrumentSelector.selectedIndex = 0;
        instrumentSelector.dispatchEvent(new Event("change")); // Restore individual instrument volume

        // Populate the loop selector
        let firstMember = new Array(new Object({ title: "Entire piece", file: json["songs"][idx]["file"] }));
        let loopList = firstMember.concat(json["songs"][idx]["loops"]);
        populate_dropdown(partSelector, loopList, "title", "file", 0);
        partSelector.selectedIndex = 0;
        partSelector.dispatchEvent(new Event("change"));
    };
}

function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
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

/**
 * Draws the keys of the selected instrument in the 'keyboard' table element.
 * @param {*} keyboard id of the table that should contain the keys
 * @param {*} instrument selected instrument information. Null value clears animation area.
 * @param {*} synthesizer
 */
function draw_instrument(keyboard, instrument, synthesizer) {
    const colorGold = "rgba(255, 215, 0, 1)";
    const colorGoldTransparent = "rgba(255, 215, 0, .3)";
    // Delete any existing keys
    keyboard.textContent = "";
    delete_keyboard_events(synthesizer);

    if (instrument == null) return;

    let config = instrument["configuration"];

    // Can currently only animate metallophones
    // TODO: enable animating circles and non-consecutive note indices)
    if (instrument["shape"] == "rectangle") {
        const keys = [];
        for (let gidx = 0; gidx < config.length; gidx++) {
            for (let kidx = 0; kidx < config[gidx].length; kidx++) {
                const shape = document.createElement("td");
                shape.className = "key";
                shape.innerHTML = config[gidx][kidx];
                keyboard.appendChild(shape);
                keys.push(shape);
            }
            // Add a space after the last key
            const shape = document.createElement("td");
            shape.className = "space";
            keyboard.appendChild(shape);
        }
        let offset = instrument.midioffset;
        synthesizer.eventHandler.addEvent("noteon", "keyboard", (event) => {
            if (event.channel == instrument["channel"]) {
                keys[(event.midiNote - 1 - offset) % keys.length].style.background = colorGold;
                delay(100);
                keys[(event.midiNote - 1 - offset) % keys.length].style.background = colorGoldTransparent;
            }
        });
        // add note off listener
        synthesizer.eventHandler.addEvent("noteoff", "keyboard", (event) => {
            if (event.channel == instrument["channel"]) {
                keys[(event.midiNote - 1 - offset) % keys.length].style.background = "";
            }
        });

        synthesizer.eventHandler.addEvent("stopall", "keyboard", () => {
            keys.forEach((key) => (key.style.background = ""));
        });
    }
}

/**
 * Initializes events of DOM elements. Parameters from position 3 refer to Element objects.
 * @param {*} sequencer {Sequencer}
 * @param {*} synthetizer {Synthesizer}
 * @param {*} settings {json}
 *
 */
export function initialize_element_events(
    sequencer,
    synthetizer,
    settings,
    playerElement,
    songSelector,
    instrumentSelector,
    loopCheckbox,
    speedSelector,
    audioTimeSlider,
    playPauseButton,
    stopButton,
    keyboard,
    logfunc
) {
    audioTimeSlider.onclick = () => {
        sequencer.currentTime = (audioTimeSlider.value / 1000) * sequencer.duration; // switch the time (the sequencer adjusts automatically)
    };

    // Change playback speed
    speedSelector.onchange = () => {
        if (!sequencer.paused) {
            sequencer.playbackRate = speedSelector.options[speedSelector.selectedIndex].value;
            instrumentSelector.dispatchEvent(new Event("change")); // Restore individual instrument volume
        }
    };

    instrumentSelector.onchange = () => {
        let selectedChannel = instrumentSelector.options[instrumentSelector.selectedIndex].value;
        // Set instrument volumes
        let instrument_index = -1;
        for (let i = 0; i < instrumentSelector.options.length; i++) {
            let option = instrumentSelector.options[i];
            let channel = option.value;
            // Max volume for focus instruments or for all instruments
            // if "None" is selected (selectedChannel=-1)
            // channel 0 (kempli + gong) should always be loud
            if ((channel == selectedChannel) | (selectedChannel < 0) | (channel == 0)) {
                synthetizer.controllerChange(channel, 7, 127, true);
                if (channel == selectedChannel) {
                    instrument_index = option.id;
                }
            } else {
                synthetizer.controllerChange(channel, 7, 50, true);
            }
        }
        // Initialize animation area for the focus instrument
        self.name = "";
        let instrument = null;
        if ((instrument_index >= 0) & (songSelector.selectedIndex >= 0)) {
            // Look up the instrument information
            let song_index = songSelector.selectedOptions[0].id;
            let song = settings["songs"][song_index];
            instrument = settings["instrumentgroup"][song["instrumentgroup"]][instrument_index];
        }
        // Draw the animation area or clear it if instrument == null
        draw_instrument(keyboard, instrument, synthetizer);
    };

    // Play/Pause button functionality
    const playPauseIcon = playPauseButton.querySelectorAll(".icon")[0];
    playPauseButton.onclick = () => {
        if (sequencer.paused) {
            playPauseIcon.innerText = "pause";
            sequencer.playbackRate = speedSelector.options[speedSelector.selectedIndex].value;
            sequencer.play(); // resume
            delay(10).then(() => {
                // Need to wait until sequencer has actually started
                instrumentSelector.dispatchEvent(new Event("change")); // Restore individual instrument volume
            });
        } else {
            playPauseIcon.innerText = "play_arrow";
            sequencer.pause(); // pause
        }
    };
    // Stop button functionality
    stopButton.onclick = () => {
        // Pause playback and reset playback pointer
        playPauseIcon.innerText = "play_arrow";
        audioTimeSlider.value = 0;
        audioTimeSlider.dispatchEvent(new Event("click")); // redraws slider and resets sequencer time
        sequencer.pause(); // pause
    };

    loopCheckbox.onclick = () => {
        sequencer.loop = true;
    };

    // sequencer.addOnSongEndedEvent(() => {logfunc("End of song");}, "restoreInstrumentSelection");
    synthetizer.eventHandler.addEvent("controllerchange", "logging", (event) => {
        logfunc(
            `synth controllerchange event channel ${event.channel},  controller ${event.controllerNumber},  controller ${event.controllerValue}`
        );
    });

    synthetizer.eventHandler.addEvent("allcontrollerreset", "logging", (event) => {
        instrumentSelector.dispatchEvent(new Event("change"));
    });
}
