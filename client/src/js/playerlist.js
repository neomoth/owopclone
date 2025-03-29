"use strict";

import { GUIWindow, windowSys } from "./windowsys.js";

let plWidth = 0;
export var playerList = {};
export var playerListTable = document.createElement("table");
export var playerListWindow = new GUIWindow('Players', { closeable: true }, wdow => {
    var tableHeader = document.createElement("tr");
    tableHeader.innerHTML = "<th>Id</th><th>Nick</th><th>X</th><th>Y</th>";
    playerListTable.appendChild(tableHeader);
    wdow.container.appendChild(playerListTable);
    wdow.container.id = "player-list";
}).move(window.innerWidth - 240, 32);
playerListWindow.container.updateDisplay = function () {
    // console.log("update");
    let diff = playerListWindow.container.parentElement.offsetWidth - plWidth
    // console.log(playerListWindow.container.parentElement.offsetWidth);
    // console.log(plWidth);
    // console.log(diff);
    if (diff !== 0) {
        playerListWindow.move(playerListWindow.x - diff, playerListWindow.y);
        plWidth = playerListWindow.container.parentElement.offsetWidth;
    }
}

export function showPlayerList(bool) {
    if (bool) {
        windowSys.addWindow(playerListWindow);
        plWidth = playerListWindow.container.parentElement.offsetWidth;
    } else {
        windowSys.delWindow(playerListWindow);
    }
}