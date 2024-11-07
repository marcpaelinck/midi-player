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
