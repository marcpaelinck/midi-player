// import the modules
import { Sequencer } from "./spessasynth_lib/sequencer/sequencer.js";
import { Synthetizer } from "./spessasynth_lib/synthetizer/synthetizer.js";
import { DATAFOLDER_URL_ABSOLUTE, WORKLET_URL_ABSOLUTE } from "./settings.js";
import { setSongOnChangeEvent, populate_dropdown, initializeElementEvents } from "./gamelanplayer/events.js";
import { log } from "./gamelanplayer/utilities.js";
import { initialize_canvas } from "./gamelanplayer/animation.js";

const dom = {
    playerElement: document.getElementById("midiplayer"),
    songSelector: document.getElementById("songselector"),
    partSelector: document.getElementById("partselector"),
    loopCheckbox: document.getElementById("loopcheckbox"),
    instrumentSelector: document.getElementById("instrumentselector"),
    speedSelector: document.getElementById("speedselector"),
    audioTimeSlider: document.getElementById("progress"),
    playPauseButton: document.getElementById("play"),
    stopButton: document.getElementById("stop"),
    canvas: document.getElementById("canvas"),
};

dom.playerElement.style.visibility = "hidden";
initialize_canvas(canvas);

let settings;

// Populate the dropdown with song titles from the content file.
fetch(DATAFOLDER_URL_ABSOLUTE + "/midifiles/content.json")
    .then((response) => response.json())
    .then((json) => {
        // Only keep songs that should be displayed
        json["songs"] = json["songs"].filter((song) => song.display);
        populate_dropdown(dom.songSelector, json["songs"], "title", [], 1);
        setSongOnChangeEvent(dom, json);
        settings = json;
    })
    .then(() => {
        // load the soundfont
        return fetch(DATAFOLDER_URL_ABSOLUTE + "/soundfont/" + settings["soundfont"]);
    })
    .then(async (response) => {
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
        // create the context and add audio worklet
        const context = new AudioContext();
        await context.audioWorklet.addModule(new URL("./spessasynth_lib/" + WORKLET_URL_ABSOLUTE, import.meta.url));
        let synthesizer = new Synthetizer(context.destination, soundFontBuffer); // create the synthetizer
        const SEQ_OPTIONS = { skipToFirstNoteOn: true, autoPlay: false };
        let sequencer = new Sequencer([], synthesizer, SEQ_OPTIONS);

        // add an event listener for the part drop-down
        // setPartOnChangeEvent(dom.partSelector, context, sequencer, dom);
        initializeElementEvents(context, sequencer, synthesizer, settings, dom, log);
    });

