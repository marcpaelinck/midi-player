// import the modules
import { Sequencer } from "./spessasynth_lib/sequencer/sequencer.js";
import { Synthetizer } from "./spessasynth_lib/synthetizer/synthetizer.js";
import { DATAFOLDER_URL_ABSOLUTE, WORKLET_URL_ABSOLUTE, LOGGING } from "./settings.js";
import { setSongOnChangeEvent, populate_dropdown, initialize_element_events } from "./gamelanplayer/utilities.js";
import { initialize_canvas } from "./gamelanplayer/animation.js";

function log(msg) {
    if (LOGGING) {
        let now = new Date();
        let hour = now.getHours();
        let minute = now.getMinutes();
        let second = now.getSeconds();
        let logmsg = `${hour}:${minute}:${second} - ${msg}`;
        document.getElementById("logger").innerText = logmsg;
    }
}

const playerElement = document.getElementById("midiplayer");
const songSelector = document.getElementById("songselector");
const partSelector = document.getElementById("partselector");
const loopCheckbox = document.getElementById("loopcheckbox");
const instrumentSelector = document.getElementById("instrumentselector");
const speedSelector = document.getElementById("speedselector");
const audioTimeSlider = document.getElementById("progress");
const playPauseButton = document.getElementById("play");
const stopButton = document.getElementById("stop");
const canvas = document.getElementById("canvas");

playerElement.style.visibility = "hidden";
initialize_canvas(canvas);

let settings;

// Populate the dropdown with song titles from the content file.
fetch(DATAFOLDER_URL_ABSOLUTE + "/midifiles/content.json")
    .then((response) => response.json())
    .then((json) => {
        // Only keep songs that should be displayed
        json["songs"] = json["songs"].filter((song) => song.display);
        populate_dropdown(songSelector, json["songs"], "title", "file", 1);
        setSongOnChangeEvent(songSelector, partSelector, instrumentSelector, json);
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
            playerElement.style.visibility = "visible";
        } else {
            document.getElementById("message").innerText = "ERROR: SoundFont not found.";
        }
        return soundFontBuffer;
    })
    .then(async (soundFontBuffer) => {
        // create the context and add audio worklet
        const context = new AudioContext();
        await context.audioWorklet.addModule(new URL("./spessasynth_lib/" + WORKLET_URL_ABSOLUTE, import.meta.url));
        const synth = new Synthetizer(context.destination, soundFontBuffer); // create the synthetizer
        let seq;

        // add an event listener for the part drop-down
        partSelector.addEventListener("change", async (event) => {
            // retrieve the file path for the selected song
            let filepath =
                DATAFOLDER_URL_ABSOLUTE + "/midifiles/".concat(event.target.options[event.target.selectedIndex].value);
            console.log(`selected file: ${filepath}`);

            // resume the context if paused
            await context.resume();

            const midiFile = await fetch(filepath).then(async (response) => {
                return response.arrayBuffer();
            });

            const parsedSongList = [{ binary: midiFile }];

            document.getElementById("play-icon").innerText = "play_arrow";
            if (seq === undefined) {
                log("creating new sequencer");
                const SEQ_OPTIONS = {
                    skipToFirstNoteOn: true,
                    autoPlay: false,
                };
                seq = new Sequencer(parsedSongList, synth, SEQ_OPTIONS); // create the sequencer
                initialize_element_events(
                    seq,
                    synth,
                    settings,
                    playerElement,
                    songSelector,
                    instrumentSelector,
                    loopCheckbox,
                    speedSelector,
                    audioTimeSlider,
                    playPauseButton,
                    stopButton,
                    canvas,
                    log
                );
            } else {
                log("loading a new song");
                seq.loadNewSongList(parsedSongList, false);
            }
            speedSelector.selectedIndex = 0;
            seq.loop = loopCheckbox.checked;
            seq.pause();

            // make the slider move with the song
            setInterval(() => {
                // slider ranges from 0 to 1000
                audioTimeSlider.value = (seq.currentTime / seq.duration) * 1000;
            }, 500);
        });
    });

