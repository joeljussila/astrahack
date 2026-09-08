import assert from 'node:assert/strict';
import {canvasHost} from '../native/canvas-routing.mjs';
const browser={readyState:1,canvasPriority:0,canvasClaim:200},native={readyState:1,canvasPriority:10,canvasClaim:100},phone={readyState:1,canvasPriority:99,canvasClaim:1000};
const clients=new Map([[browser,'host'],[phone,'phone'],[native,'host']]);
assert.equal(canvasHost(clients),native);browser.canvasClaim=9000;assert.equal(canvasHost(clients),native);native.readyState=3;assert.equal(canvasHost(clients),browser);clients.delete(browser);assert.equal(canvasHost(clients),undefined);
console.log('PASS desktop priority, later browser focus, disconnected host and phone isolation');
