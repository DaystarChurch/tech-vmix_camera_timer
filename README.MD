# vMix Camera Timer

A script that connects to vMix and serves a web page that shows how long the active camera has been active.

![Screenshot of the result](https://github.com/DaystarChurch/tech-vmix_camera_timer/blob/1c82eb9b65ecf8d0a27d8348dd5a69d64eb12d78/assets/Screenshot%20from%202025-05-23%2014-01-50.png)

## How to Install

- [Clone the repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)
- Install:
`npm install`

## How to Use
- Start the script:
`npm run start <vMix IP>` or `npm run start localhost` if you're running this on the vMix computer

- Note the address to connect to:

![Screenshot of script launching](https://github.com/DaystarChurch/tech-vmix_camera_timer/blob/1c82eb9b65ecf8d0a27d8348dd5a69d64eb12d78/assets/Screenshot%20from%202025-05-23%2014-13-57.png)

- Open the address in your browser


## About
This script uses [vMix's TCP API](https://www.vmix.com/help25/index.htm?DeveloperAPI.html) and listens for camera changes.  It then passes that information over websocket to connected web clients.


## Project Structure

The main script is `cameraTimerServer.js`, it connects to vMix.  

The generated website is served from `/dist`, `/src` has the TypeScript

`mockVMixServer.js` is a mock vMix server for testing, it should only be run for testing purposes.