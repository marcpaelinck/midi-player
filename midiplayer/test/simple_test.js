// import the modules
import { DATAFOLDER_URL_ABSOLUTE, WORKLET_URL_ABSOLUTE } from "../settings.js";
import { Sequencer } from "../spessasynth_lib/sequencer/sequencer.js";
import { Synthetizer } from "../spessasynth_lib/synthetizer/synthetizer.js";

function stringify(object) {
    let str = "";
    for (const [key, value] of object.entries()) {
        str += `${key}: ${value}\n`;
    }
    return str;
}

fetch(DATAFOLDER_URL_ABSOLUTE + "/soundfont/GAMELAN1.sf2")
    .catch((error) => {
        document.getElementById("message").innerText += `\n(fetch error) ${error.message}`;
    })
    .then(async (response) => {
        // load the soundfont into an array buffer
        let message;
        if (response.headers.get("content-length") > 0) {
            message = "SoundFont loaded.";
        } else {
            message = "SoundFont not loaded!";
        }
        document.getElementById("message").innerText += `\n(fetch soundfont) ${message}`;
        document.getElementById("message").innerText += `\n(fetch soundfont status) ${response.statusText}`;
        document.getElementById("message").innerText += `\n(fetch soundfont headers) ${stringify(response.headers)}`;
        return response.arrayBuffer();
    })
    .catch((error) => {
        document.getElementById("message").innerText += `\n(arrayBuffer error) ${error.message}`;
    })
    .then(async (response) => {
        let soundFontArrayBuffer = response;
        document.getElementById("message").innerText += `\n(arrayBuffer) byteLength: ${response.byteLength}`;

        // add an event listener for the file inout
        document.getElementById("play").addEventListener("click", async (event) => {
            try {
                let filepath = DATAFOLDER_URL_ABSOLUTE + "/midifiles/Lengker Ubud_full_GAMELAN1.mid";
                const midiFile = await fetch(filepath)
                    .then(async (response) => {
                        if (response.ok) {
                            document.getElementById("message").innerText += "\nMIDI file loaded.";
                            return response.arrayBuffer();
                        } else {
                            document.getElementById("message").innerText += "\nERROR: MIDI file not found.";
                        }
                    })
                    .catch((error) => {
                        document.getElementById("message").innerText += `\n(load MIDI file error) ${error.message}`;
                    });
                let msg;

                const context = new AudioContext(); // create an audioContext
                if (context == null) msg = `\n(create context) no context created.`;
                else {
                    msg = `\n(create context) OK, context state=${context.state}`;
                }
                document.getElementById("message").innerText += msg;

                await context.audioWorklet
                    .addModule(new URL("../spessasynth_lib/" + WORKLET_URL_ABSOLUTE, import.meta.url))
                    .catch((error) => {
                        document.getElementById("message").innerText += `\n(create worklet error) ${error.message}`;
                    }); // add the worklet

                const synth = new Synthetizer(context.destination, soundFontArrayBuffer); // create the synthetizer
                if (synth == null) msg = `\n(create synthesizer error) no synthesizer created.`;
                else msg = `\n(create synthesizer) OK`;
                document.getElementById("message").innerText += msg;

                const seq = new Sequencer([{ binary: midiFile }], synth); // create the sequencer
                if (seq == null) msg = `\n(create sequencer error) no sequencer created.`;
                else msg = `\n(create sequencer) OK`;
                document.getElementById("message").innerText += msg;

                seq.play();
                document.getElementById("play").disabled = true;
                document.getElementById("play").onmousemove = "";
            } catch (error) {
                document.getElementById("message").innerText += `\n(set up player error) ${error.message}`;
            }
        });
    })
    .catch((error) => {
        document.getElementById("message").innerText += `\n(set up player error) ${error.message}`;
    });
