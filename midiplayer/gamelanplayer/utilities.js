import { LOGGING } from "../settings.js";

export function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

export function log(msg) {
    if (LOGGING) {
        let now = new Date();
        let hour = now.getHours();
        let minute = now.getMinutes();
        let second = now.getSeconds();
        let logmsg = `${hour}:${minute}:${second} - ${msg}`;
        document.getElementById("logger").innerText = logmsg;
    }
}

const msgTypes = ["always"];
export function logConsole(msg, msg_type = none) {
    if (LOGGING && msgTypes.includes(msg_type)) {
        let now = new Date();
        let hour = now.getHours();
        let minute = now.getMinutes();
        let second = now.getSeconds();
        let millis = now.getMilliseconds();
        let logmsg = `${hour}:${minute}:${second}:${millis} - ${msg}`;
        console.log(logmsg);
    }
}

export function waitForObjectContent(selector) {
    return new Promise((resolve) => {
        if (document.querySelector(selector).getSVGDocument()) {
            return resolve(document.querySelector(selector).getSVGDocument());
        }

        const observer = new MutationObserver((mutations) => {
            if (document.querySelector(selector).contentDocument) {
                observer.disconnect();
                resolve(document.querySelector(selector).getSVGDocument());
            }
        });

        // If you get "parameter 1 is not of type 'Node'" error, see https://stackoverflow.com/a/77855838/492336
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    });
}
/**
 * See https://www.w3schools.com/howto/howto_html_include.asp
 * @param {*} element Content will be inserted within this element
 * @param {*} file File containing the XML/HTML content
 */
export function loadHTMLContent(element, file) {
    return new Promise((resolve) => {
        element.setAttribute("w3-include-html", file);
        let xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function () {
            let success = false;
            if (xhttp.readyState == 4 && xhttp.status == 200) {
                element.innerHTML = this.responseText;
                success = true;
                resolve(`Image loaded from ${file}`);
            } else if (xhttp.readyState === 4) {
                reject(`Could not load image from ${file}`);
            }
        };
        xhttp.open("GET", file, true);
        xhttp.send();
    });
}

/**
 * For debugging. Adds listener to sequencer events
 * @param {Sequencer} sequencer
 * @param {Object<HTMLElement>} sequencer dictionary of DOM elements
 */
export function setTracking(sequencer, dom) {
    if (LOGGING) {
        sequencer.addOnSongEndedEvent(() => {
            console.log("song changed");
        }, "testlogging");
    }
}
