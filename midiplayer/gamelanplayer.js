// import the modules
import { Sequencer } from "./spessasynth_lib/sequencer/sequencer.js";
import { Synthetizer } from "./spessasynth_lib/synthetizer/synthetizer.js";
import { DATAFOLDER_URL_ABSOLUTE, WORKLET_URL_ABSOLUTE } from "./settings.js";
import { initializeDropDownsAndEvents, restoreInstrumentVolumes } from "./gamelanplayer/userinterface.js";
import { log, setTracking } from "./gamelanplayer/utilities.js";
// import { parse } from "./yaml/browser/dist/index.js";

const dom = {
    playerElement: document.getElementById("midiplayer"),
    songSelector: document.getElementById("songselector"),
    partSelector: document.getElementById("partselector"),
    loopCheckbox: document.getElementById("loopcheckbox"),
    instrumentSelector: document.getElementById("instrumentselector"),
    speedSelector: document.getElementById("speedselector"),
    audioTimeSlider: document.getElementById("progress"),
    audioTimeSliderMarkers: document.getElementById("progress-markers"),
    audioTimeDisplay: document.getElementById("elapsedtime"),
    playPauseButton: document.getElementById("play"),
    stopButton: document.getElementById("stop"),
    canvas: document.getElementById("canvas"),
    panggulSelectorForm: document.getElementById("show-panggul"),
    panggulCheckbox: document.querySelector("#show-panggul .checkbox"),
};

dom.playerElement.style.visibility = "hidden";

let settings;

// Load the JSON settings file
// fetch(DATAFOLDER_URL_ABSOLUTE + "/midifiles/content.yaml")
//     .then((response) => response.text())
//     .then((text) => parse(text))
fetch(DATAFOLDER_URL_ABSOLUTE + "/midifiles/content.json")
    .then((response) => response.json())
    .then((json) => {
        settings = json;
        settings["datafolder"] = DATAFOLDER_URL_ABSOLUTE;
    })
    .then(() => {
        // Import the soundfont
        return fetch(DATAFOLDER_URL_ABSOLUTE + "/soundfont/" + settings["soundfont"]);
    })
    .then(async (response) => {
        // Load the soundfont into a buffer
        let soundFontBuffer = await response.arrayBuffer();
        if (response.headers.get("content-length") > 0) {
            document.getElementById("message").innerText = " ";
            dom.playerElement.style.visibility = "visible";
        } else {
            document.getElementById("message").innerText = "ERROR: SoundFont not found.";
        }
        return soundFontBuffer;
    })
    .then(async (soundFontBuffer) => {
        // create the audio context, sequencer and synthesizer
        const context = new AudioContext();
        await context.audioWorklet.addModule(new URL("./spessasynth_lib/" + WORKLET_URL_ABSOLUTE, import.meta.url));
        let synthesizer = new Synthetizer(context.destination, soundFontBuffer); // create the synthetizer
        const SEQ_OPTIONS = { skipToFirstNoteOn: true, autoPlay: false };
        let sequencer = new Sequencer([], synthesizer, SEQ_OPTIONS);
        sequencer.skipToFirstNoteOn = false;

        // Restore individual instrument volumes when looping.
        // (Apparently, all channel volumes are being reset when a song is restarted).
        sequencer.addOnTimeChangeEvent((time) => {
            if (Math.abs(time) < 0.1) {
                console.log(`(re-)starting song`);
                restoreInstrumentVolumes(synthesizer, settings);
            }
        }, "resetfocus");

        // Set tracking
        setTracking(sequencer, dom);

        // Set up the user interfae
        initializeDropDownsAndEvents(context, sequencer, synthesizer, settings, dom, log);
    });
