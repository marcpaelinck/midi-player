// import the modules
import { Sequencer } from "../../spessasynth_lib/sequencer/sequencer.js";
import { Synthetizer } from "../../spessasynth_lib/synthetizer/synthetizer.js";
import { WORKLET_URL_ABSOLUTE } from "../../spessasynth_lib/synthetizer/worklet_url.js";

// load the soundfont
fetch("../data/soundfont/GONG_KEBYAR3.sf2").then(async (response) => {
    // load the soundfont into an array buffer
    let soundFontArrayBuffer = await response.arrayBuffer();

    if (response.headers.get("content-length") > 0) {
    document.getElementById("message").innerText = "SoundFont has been loaded!";
    } else {
    document.getElementById("message").innerText = "ERROR: SoundFont not found.";
    }

    // add an event listener for the file inout
    document
    .getElementById("midi_input")
    .addEventListener("change", async (event) => {
      // check if any files are added
      if (!event.target.files[0]) {
        return;
      }
      const midiFile = await event.target.files[0].arrayBuffer(); // get the file and conver to ArrayBuffer
      const context = new AudioContext(); // create an audioContext
      await context.audioWorklet.addModule(
        new URL(
          "../spessasynth_lib/" + WORKLET_URL_ABSOLUTE,
          import.meta.url
        )
      ); // add the worklet
      // context.audioWorklet = "xg";
      const synth = new Synthetizer(context.destination, soundFontArrayBuffer); // create the synthetizer
      // synth.systemExclusive([0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7F, 0x00, 0x41, 0xF7]); // switch to Roland GS Synthesizer mode
      // synth.systemExclusive([0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7]); // switch to Yamaha XG Synthesizer mode
      // synth.systemExclusive([0x43, 0x10, 0x4c, 0x08, 0x00, 0x01, 0x00, 0xf7]); // Yamaha XG: MSB for channel 0
      // synth.systemExclusive([0x43, 0x10, 0x4c, 0x08, 0x00, 0x02, 0x00, 0xf7]); // Yamaha XG: LSB for channel 0
      // synth.systemExclusive([0x43, 0x10, 0x4c, 0x08, 0x00, 0x03, 0x00, 0xf7]); // Yamaha XG: Program for channel 0
      // synth.systemExclusive([0x43, 0x10, 0x4c, 0x08, 0x01, 0x01, 0x01, 0xf7]); // Yamaha XG: MSB for channel 1
      // synth.systemExclusive([0x43, 0x10, 0x4c, 0x08, 0x01, 0x02, 0x00, 0xf7]); // Yamaha XG: LSB for channel 1
      // synth.systemExclusive([0x43, 0x10, 0x4c, 0x08, 0x01, 0x03, 0x00, 0xf7]); // Yamaha XG: Program for channel 1

      // GM2 System On = F0 7E 7F 09 03 F7
      // XG System On = F0 43 10 4C 00 00 7E 00 F7
      // GS System On = F0 41 10 42 12 40 00 7F 00 41 F7[/code]

      //   synth.lockController(0, 0, false);
      //   synth.lockController(0, 32, false);
      // synth.controllerChange(0, 0, 0);
      // synth.controllerChange(0, 32, 0);
      // synth.programChange(0, 0);
      //   synth.lockController(0, 0, false);
      //   synth.lockController(0, 32, false);
      // synth.controllerChange(1, 0, 1);
      // synth.controllerChange(1, 32, 0);
      // synth.programChange(1, 0);
      // synth.lockController(0, 0, false);
      // synth.lockController(0, 32, false);
      // synth.controllerChange(9, 0, 128);
      // synth.controllerChange(9, 32, 0);
      // synth.programChange(9, 0);
      const seq = new Sequencer([{ binary: midiFile }], synth); // create the sequencer
      // synth.controllerChange(0, 7, 50, true);
      // synth.controllerChange(1, 7, 50, true);
      // synth.controllerChange(2, 7, 50, true);
      seq.play();
    });
});