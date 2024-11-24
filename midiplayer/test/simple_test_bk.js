// import the modules
import { DATAFOLDER_URL_ABSOLUTE, WORKLET_URL_ABSOLUTE } from "../settings.js";
import { Sequencer } from "../spessasynth_lib/sequencer/sequencer.js";
import { Synthetizer } from "../spessasynth_lib/synthetizer/synthetizer.js";

fetch(DATAFOLDER_URL_ABSOLUTE + "/soundfont/GAMELAN1.sf2")
    .then(async (response) => {
        // load the soundfont into an array buffer
        let soundFontArrayBuffer = await response.arrayBuffer();
        let status = response.statusText + ", ";

        if (response.headers.get("content-length") > 0) {
            status += "SoundFont loaded.";
        } else {
            status += "SoundFont not loaded!";
        }

        // add an event listener for the file inout
        document.getElementById("play").addEventListener("click", async (event) => {
            let filepath = DATAFOLDER_URL_ABSOLUTE + "/midifiles/Lengker Ubud_full_GAMELAN1.mid";
            const midiFile = await fetch(filepath).then(async (response) => {
                if (response.ok) {
                    document.getElementById("message").innerText += "\nMIDI file loaded.";
                    return response.arrayBuffer();
                } else {
                    document.getElementById("message").innerText += "\nERROR: MIDI file not found.";
                }
            });
            const context = new AudioContext(); // create an audioContext
            await context.audioWorklet.addModule(
                new URL("../spessasynth_lib/" + WORKLET_URL_ABSOLUTE, import.meta.url)
            ); // add the worklet
            const synth = new Synthetizer(context.destination, soundFontArrayBuffer); // create the synthetizer
            const seq = new Sequencer([{ binary: midiFile }], synth); // create the sequencer
            seq.play();
            document.getElementById("play").disabled = true;
            document.getElementById("play").onmousemove = "";
        });
    })
    .catch((error) => console.log(error.message));
