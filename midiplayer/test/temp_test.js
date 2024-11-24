import { parse } from "../../node_modules/yaml/browser/dist/index.js";
import { DATAFOLDER_URL_ABSOLUTE } from "../settings.js";

const dom = {
    startButton: document.getElementById("start"),
};

// Load the JSON settings file
fetch(DATAFOLDER_URL_ABSOLUTE + "/midifiles/content.yaml")
    .then((response) => response.text())
    .then((text) => {
        let content = parse(text);
        console.log(content);
    });
