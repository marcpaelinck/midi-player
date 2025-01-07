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

const displayLogMsgTypes = ["always", "helpinghand"]; // Determines which types will be logged.
export function logConsole(msg, msg_type = none) {
    if (LOGGING && displayLogMsgTypes.includes(msg_type)) {
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
    return new Promise((resolve, reject) => {
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

export function fetchJSONData(path) {
    return new Promise((resolve) => {
        fetch(path)
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP error! Status: ${res.status}`);
                }
                resolve(res.json());
            })
            .catch((error) => reject("Unable to fetch data:", error));
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

export function timeFormat(timeValue) {
    // Trigger is sequencer time change: value is elapsed time.
    let mm = Math.floor(timeValue / 60);
    let ss = Math.round(timeValue - 60 * mm, 0);
    return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}
