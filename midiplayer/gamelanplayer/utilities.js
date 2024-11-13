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

export function logConsole(msg) {
    let now = new Date();
    let hour = now.getHours();
    let minute = now.getMinutes();
    let second = now.getSeconds();
    let millis = now.getMilliseconds();
    let logmsg = `${hour}:${minute}:${second}:${millis} - ${msg}`;
    console.log(logmsg);
}

export async function waitForSVGDocLoaded(embedID) {
    while (!document.getElementById("svg-embed").getSVGDocument()) {
        await delay(500);
        // console.log(`loop: docReady=${document.readyState}`);
    } // console.log(`ready: docReady=${document.readyState}`);
}
