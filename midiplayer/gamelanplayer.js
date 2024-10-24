// import the modules
import { Sequencer } from "./spessasynth_lib/sequencer/sequencer.js";
import { Synthetizer } from "./spessasynth_lib/synthetizer/synthetizer.js";
import { DATAFOLDER_URL_ABSOLUTE, WORKLET_URL_ABSOLUTE } from "./paths.js";
import { populate_dropdown } from "./gamelanplayer/dropdown.js";

const LOGGING = false
function log(msg) {
    if (LOGGING) {
      document.getElementById("logger").innerText = msg;
    }
}

let playerElement = document.getElementById("midiplayer")
let songSelector = document.getElementById("songselector");
let instrumentSelector = document.getElementById("instrumentselector");
let speedSelector = document.getElementById("speedselector");

playerElement.style.visibility = "hidden";

// Populate the dropdown with song titles
// This takes less time than loading the soundfont, 
// so both actions can be performed in parallel.
fetch(DATAFOLDER_URL_ABSOLUTE + "/midifiles/content.json")
  .then((response) => response.json())
  .then((json) => {
    populate_dropdown(songSelector, json["songs"], "title", "file", log)
    populate_dropdown(instrumentSelector, json["instruments"], "name", "channel", log);
  });

  // load the soundfont
fetch(DATAFOLDER_URL_ABSOLUTE + "/soundfont/GONG_KEBYAR3.sf2").then(async (response) => {
  let soundFontBuffer = await response.arrayBuffer();

  if (response.headers.get("content-length") > 0) {
    document.getElementById("message").innerText = " ";
    playerElement.style.visibility = "visible";
  } else {
    document.getElementById("message").innerText =
      "ERROR: SoundFont not found.";
  }

  // create the context and add audio worklet
  const context = new AudioContext();
  await context.audioWorklet.addModule(
    new URL("./spessasynth_lib/" + WORKLET_URL_ABSOLUTE, import.meta.url)
  );
  const synth = new Synthetizer(context.destination, soundFontBuffer); // create the synthetizer
  let seq;
  
  // add an event listener for the file inout
  songSelector.addEventListener("change", async (event) => {
    // check if any files are added
    //   if (!event.target.selectedIndex) {
    //     log("No file selected");
    //     return;
    //   }
    // retrieve the file path for the selected song
    let filepath =
      DATAFOLDER_URL_ABSOLUTE +
      "/midifiles/".concat(
        event.target.options[event.target.selectedIndex].value
      );
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
    } else {
      log("loading a new song");
      seq.loadNewSongList(parsedSongList, false);
    }
    speedSelector.selectedIndex = 0;
    seq.loop = false;
    seq.pause();

    // make the slider move with the song
    let audioTimeSlider = document.getElementById("progress");
    setInterval(() => {
      // slider ranges from 0 to 1000
      audioTimeSlider.value = (seq.currentTime / seq.duration) * 1000;
    }, 100);

    // on song change, show the name
    // seq.addOnSongChangeEvent((e) => {
    //   document.getElementById("message").innerText =
    //     "Now playing: " + e.midiName;
    // }, "example-time-change"); // make sure to add a unique id!

    // Add time adjustment
    audioTimeSlider.onchange = () => {
      seq.currentTime = (audioTimeSlider.value / 1000) * seq.duration; // switch the time (the sequencer adjusts automatically)
    };

    // Change playback speed
    speedSelector.onchange = () => {
      if (!seq.paused) {
        seq.playbackRate =
          speedSelector.options[speedSelector.selectedIndex].value;
      }
    };

    // Change instrument focus
    instrumentSelector.onchange = () => {
        let selectedChannel = instrumentSelector.options[instrumentSelector.selectedIndex].value;
        for (let i=0; i<instrumentSelector.options.length; i++) {
            let channel = instrumentSelector.options[i].value;
            if ((channel == selectedChannel) | (selectedChannel < 0)) {
              synth.controllerChange(channel, 7, 127, true);
            } else {
              synth.controllerChange(channel, 7, 50, true);
            }
        }
    };

    // Play/Pause button functionality
    document.getElementById("play").onclick = () => {
      if (seq.paused) {
        document.getElementById("play-icon").innerText = "pause";
        seq.playbackRate =
          speedSelector.options[speedSelector.selectedIndex].value;
        seq.play(); // resume
      } else {
        document.getElementById("play-icon").innerText = "play_arrow";
        seq.pause(); // pause
      }
    };

    // Stop button functionality
    document.getElementById("stop").onclick = () => {
      if (!seq.paused) {
        // Pause playback and reset playback pointer
        document.getElementById("play-icon").innerText = "play_arrow";
      }
      audioTimeSlider.value = 0;
      audioTimeSlider.dispatchEvent(new Event("change")); // redraws slider and resets sequencer time
      seq.pause(); // pause
    };
  });
});