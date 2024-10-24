export function populate_dropdown(selector, jsoncontent, key, value, logfunc)
{
    // Populate the selector element
    for (let i = 0; i < jsoncontent.length; i++) {
      let item = jsoncontent[i];
      // Skip keys starting with underscore
      if (!item[key].startsWith("_")){
        var option = document.createElement("option");
        option.value = item[value];
        option.id = item[key].toLowerCase().replace(" ", "");
        option.innerHTML = item[key];
        selector.appendChild(option);
      }
    }

    // Remove an initial "Select a <type>..." option (if present)
    // as soon as a selection is made by the user.
    function showSongSelector() {
        let idx = selector.selectedIndex;
        if (
        (selector.options[idx].id != "_select_") &
        (selector.options[0].id == "_select_")
        ) {
            selector.remove(0);
            // selector.dispatchEvent(new Event("change"));    
        }
    }
    selector.onchange = showSongSelector;
    }
// export function populate_dropdown(selector, jsoncontent, logfunc) {
//   // Populate the selector element
//   for (const key in jsoncontent) {
//     var option = document.createElement("option");
//     option.value = jsoncontent[key];
//     option.id = key.toLowerCase().replace(" ", "");
//     option.innerHTML = key;
//     selector.appendChild(option);
//   }

//   // Remove the initial "Select a composition..." option
//   // as soon as a selection is made by the user.
//   function showSongSelector() {
//     let idx = selector.selectedIndex;
//     if (
//       (selector.options[idx].id != "_select_") &
//       (selector.options[0].id == "_select_")
//     ) {
//       selector.remove(0);
//       // selector.dispatchEvent(new Event("change"));
//     }
//   }
//   selector.onchange = showSongSelector;
// }
