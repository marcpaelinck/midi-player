const helpingHand = document.getElementById("helpinghand");

const bezier = "cubic-bezier(0.87, 0.02, 0.15, 0.99)";
const coord = {
    DING: "translate(0%)",
    DONG: "translate(10.3%)",
    DENG: "translate(20.5%)",
    DUNG: "translate(30.9%)",
    DANG: "translate(41%)",
};
const melody = [
    ["DANG", 2],
    ["DONG", 2],
    ["DING", 2],
    ["DENG", 2],
    ["DONG", 2],
    ["DENG", 2],
    ["DING", 2],
    ["DONG", 2],
];
const animationDuration = 1;
var note_seq = 7;
var prevnote = null;

function moveToNextNote(event = null) {
    note_seq = (note_seq + 1) % melody.length;
    var note = melody[note_seq][0];
    var timeUntilNext = melody[note_seq][1];
    var startMoving = Math.max(timeUntilNext - animationDuration, 0) / timeUntilNext;
    var helpingHandKeyframes = new KeyframeEffect(
        helpingHand,
        [
            { transform: coord[prevnote], offset: 0 },
            { transform: coord[prevnote], offset: startMoving, easing: bezier },
            { transform: coord[note], offset: 1 },
        ],
        { duration: timeUntilNext * 1000, fill: "forwards" }
    );

    var helpingHandAnimation = new Animation(helpingHandKeyframes, document.timeline);
    helpingHandAnimation.onfinish = moveToNextNote;
    helpingHandAnimation.play();
    prevnote = note;
}

helpingHand.addEventListener("mousedown", startHelping, false);
function startHelping(event) {
    helpingHand.removeEventListener("mousedown", startHelping, false);
    moveToNextNote();
}
