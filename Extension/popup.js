/*  TODOS
*   MUST:
*       ☺
*   SHOULD:
*       sort videos by offsetwidth
*       presets for filters
*       replace await sleep with promisified structure
*   COULD:
*       indentify video on header:hover
*   WONT:
*       download video
*           https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API
*/

async function main(defaults) {
    const videosListEl = document.getElementById("videosList");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const template = {
        name: "",
        existing: false,
        
    }

    // index: { localindex, parsedFilter, playbackRate, windowUri }
    const vidMap = {};
    // accumulator for videos from all frames
    const videoList = [];

    chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
        if (request.greeting === "videos") {
            sendResponse({ greeting: 'success' });
            videoList.push(...request.videos);
        } else {
            sendResponse({ greeting: 'failure' });
        }
    });

    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        function: () => {
            function mapVid(vid, index) {
                return { index: index, filter: vid.style.filter, playbackRate: vid.playbackRate, uri: window.location.href };
            }
            const vids = Array.from(document.querySelectorAll("video")).map(mapVid);
            chrome.runtime.sendMessage({ greeting: "videos", videos: vids });
        },
    }, _ => !chrome.runtime.lastError || console.log("Error(getVids):", chrome.runtime.lastError));

    // wait for videos to be found
    await sleep(100);

    // for each video create a div with controls and append it to the videosList
    vidList(videoList);
    console.log(videoList.map(vid => vid.index));
    function vidList(videos) {
        if (videos.length === 0) {
            videosListEl.classList.add("noVidsFound");
            videosListEl.innerHTML = `No videos found on page! <br> If there is one, use the feedback button on the options page!`;
            return
        }
        for (let i = 0; i < videos.length; i++) {
            const pf = parseFilter(videos[i].filter);
            vidMap[i] = { localIndex: videos[i].index, pf: pf, playbackRate: videos[i].playbackRate, uri: videos[i].uri };

            let videoEl = document.createElement("div");
            let vidLabel = document.createElement("h3");
            let reqPIPBtn = document.createElement("button");
            reqPIPBtn.title = "Toggle Picture In Picture";
            reqPIPBtn.addEventListener("click", () => {
                reqPIP(videos[i].index, vidMap[i])
            });

            vidLabel.innerHTML = videos.length > 1 ? `Video: ${i + 1}` : '&nbsp';
            vidLabel.appendChild(reqPIPBtn);
            videoEl.appendChild(vidLabel);
            videosListEl.appendChild(videoEl);

            addFilterElements(videos, i, videoEl, pf);
            addPlaybackRateElement(videos, i, videoEl);
        }
    };

    function addFilterElements(videos, i, videoEl, pf) {
        //brightness
        const brightnessDiv = document.createElement("div");
        const brightnessLabel = document.createElement("label");
        brightnessLabel.innerHTML = "Brightness:";
        const brightnessPercent = document.createElement("span");
        brightnessPercent.innerHTML = `${Math.round(pf.brightness * 100)}%`;
        const brightnessSlider = document.createElement("input");
        brightnessSlider.type = "range";
        brightnessSlider.min = defaults.brightness.min;
        brightnessSlider.step = defaults.brightness.step;
        brightnessSlider.max = defaults.brightness.max;
        brightnessSlider.value = pf.brightness;
        brightnessDiv.appendChild(brightnessLabel);
        brightnessDiv.appendChild(brightnessSlider);
        brightnessDiv.appendChild(brightnessPercent);
        //brightness reset button
        const brightnessReset = document.createElement("button");
        brightnessReset.disabled = pf.brightness == defaults.brightness.v;
        brightnessReset.addEventListener("click", () => {
            // update template TODO, repeat for all eventListeners
            brightnessSlider.value = 1;
            brightnessPercent.innerHTML = `${Math.round(brightnessSlider.value * 100)}%`;
            vidMap[i].pf.brightness = brightnessSlider.value;
            brightnessReset.disabled = true;
            setFilter(videos[i].index, vidMap[i]);
        });
        brightnessSlider.addEventListener("input", () => {
            //set brightness val and update filter
            brightnessPercent.innerHTML = `${Math.round(brightnessSlider.value * 100)}%`;
            vidMap[i].pf.brightness = brightnessSlider.value;
            brightnessReset.disabled = brightnessSlider.value == defaults.brightness.v;
            setFilter(videos[i].index, vidMap[i]);
        });
        brightnessDiv.appendChild(brightnessReset);
        videoEl.appendChild(brightnessDiv);

        //contrast
        const contrastDiv = document.createElement("div");
        const contrastLabel = document.createElement("label");
        contrastLabel.innerHTML = "Contrast:";
        const contrastPercent = document.createElement("span");
        contrastPercent.innerHTML = `${Math.round(pf.contrast * 100)}%`;
        const contrastSlider = document.createElement("input");
        contrastSlider.type = "range";
        contrastSlider.min = defaults.contrast.min;
        contrastSlider.step = defaults.contrast.step;
        contrastSlider.max = defaults.contrast.max;
        contrastSlider.value = pf.contrast;
        contrastDiv.appendChild(contrastLabel);
        contrastDiv.appendChild(contrastSlider);
        contrastDiv.appendChild(contrastPercent);
        //contrast reset button
        const contrastReset = document.createElement("button");
        contrastReset.disabled = pf.contrast == defaults.contrast.v;
        contrastReset.addEventListener("click", () => {
            contrastSlider.value = 1;
            contrastPercent.innerHTML = `${Math.round(contrastSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.contrast = contrastSlider.value;
            contrastReset.disabled = true;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        contrastSlider.addEventListener("input", () => {
            //set contrast val and update filter
            contrastPercent.innerHTML = `${Math.round(contrastSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.contrast = contrastSlider.value;
            contrastReset.disabled = contrastSlider.value == defaults.contrast.v;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        contrastDiv.appendChild(contrastReset);
        videoEl.appendChild(contrastDiv);

        //saturation
        const saturationDiv = document.createElement("div");
        const saturationLabel = document.createElement("label");
        saturationLabel.innerHTML = "Saturation:";
        const saturationPercent = document.createElement("span");
        saturationPercent.innerHTML = `${Math.round(pf.saturate * 100)}%`;
        const saturationSlider = document.createElement("input");
        saturationSlider.type = "range";
        saturationSlider.min = defaults.saturation.min;
        saturationSlider.step = defaults.saturation.step;
        saturationSlider.max = defaults.saturation.max;
        saturationSlider.value = pf.saturate;
        saturationDiv.appendChild(saturationLabel);
        saturationDiv.appendChild(saturationSlider);
        saturationDiv.appendChild(saturationPercent);
        //saturation reset button
        const saturationReset = document.createElement("button");
        saturationReset.disabled = pf.saturate == defaults.saturation.v;
        saturationReset.addEventListener("click", () => {
            saturationSlider.value = 1;
            saturationPercent.innerHTML = `${Math.round(saturationSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.saturate = saturationSlider.value;
            saturationReset.disabled = true;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        saturationSlider.addEventListener("input", () => {
            //set saturation val and update filter
            saturationPercent.innerHTML = `${Math.round(saturationSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.saturate = saturationSlider.value;
            saturationReset.disabled = saturationSlider.value == defaults.saturation.v;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        saturationDiv.appendChild(saturationReset);
        videoEl.appendChild(saturationDiv);

        //invert
        const invertDiv = document.createElement("div");
        const invertLabel = document.createElement("label");
        invertLabel.innerHTML = "Invert:";
        const invertPercent = document.createElement("span");
        invertPercent.innerHTML = `${Math.round(pf.invert * 100)}%`;
        const invertSlider = document.createElement("input");
        invertSlider.type = "range";
        invertSlider.min = defaults.invert.min;
        invertSlider.step = defaults.invert.step;
        invertSlider.max = defaults.invert.max;
        invertSlider.value = pf.invert;
        invertDiv.appendChild(invertLabel);
        invertDiv.appendChild(invertSlider);
        invertDiv.appendChild(invertPercent);
        //invert reset button
        const invertReset = document.createElement("button");
        invertReset.disabled = pf.invert == defaults.invert.v;
        invertReset.addEventListener("click", () => {
            invertSlider.value = 0;
            invertPercent.innerHTML = `${Math.round(invertSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.invert = invertSlider.value;
            invertReset.disabled = true;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        invertSlider.addEventListener("input", () => {
            //set invert val and update filter
            invertPercent.innerHTML = `${Math.round(invertSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.invert = invertSlider.value;
            invertReset.disabled = invertSlider.value == defaults.invert.v;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        invertDiv.appendChild(invertReset);
        videoEl.appendChild(invertDiv);

        //sepia
        const sepiaDiv = document.createElement("div");
        const sepiaLabel = document.createElement("label");
        sepiaLabel.innerHTML = "Sepia:";
        const sepiaPercent = document.createElement("span");
        sepiaPercent.innerHTML = `${Math.round(pf.sepia * 100)}%`;
        const sepiaSlider = document.createElement("input");
        sepiaSlider.type = "range";
        sepiaSlider.min = defaults.sepia.min;
        sepiaSlider.step = defaults.sepia.step;
        sepiaSlider.max = defaults.sepia.max;
        sepiaSlider.value = pf.sepia;
        sepiaDiv.appendChild(sepiaLabel);
        sepiaDiv.appendChild(sepiaSlider);
        sepiaDiv.appendChild(sepiaPercent);
        //sepia reset button
        const sepiaReset = document.createElement("button");
        sepiaReset.disabled = pf.sepia == defaults.sepia.v;
        sepiaReset.addEventListener("click", () => {
            sepiaSlider.value = 0;
            sepiaPercent.innerHTML = `${Math.round(sepiaSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.sepia = sepiaSlider.value;
            sepiaReset.disabled = true;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        sepiaSlider.addEventListener("input", () => {
            //set sepia val and update filter
            sepiaPercent.innerHTML = `${Math.round(sepiaSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.sepia = sepiaSlider.value;
            sepiaReset.disabled = sepiaSlider.value == defaults.sepia.v;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        sepiaDiv.appendChild(sepiaReset);
        videoEl.appendChild(sepiaDiv);

        //opacity
        const opacityDiv = document.createElement("div");
        const opacityLabel = document.createElement("label");
        opacityLabel.innerHTML = "Opacity:";
        const opacityPercent = document.createElement("span");
        opacityPercent.innerHTML = `${Math.round(pf.opacity * 100)}%`;
        const opacitySlider = document.createElement("input");
        opacitySlider.type = "range";
        opacitySlider.min = defaults.opacity.min;
        opacitySlider.step = defaults.opacity.step;
        opacitySlider.max = defaults.opacity.max;
        opacitySlider.value = pf.opacity;
        opacityDiv.appendChild(opacityLabel);
        opacityDiv.appendChild(opacitySlider);
        opacityDiv.appendChild(opacityPercent);
        //opacity reset button
        const opacityReset = document.createElement("button");
        opacityReset.disabled = pf.opacity == defaults.opacity.v;
        opacityReset.addEventListener("click", () => {
            opacitySlider.value = 1;
            opacityPercent.innerHTML = `${Math.round(opacitySlider.value * 100)}%`;
            vidMap[videos[i].index].pf.opacity = opacitySlider.value;
            opacityReset.disabled = true;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        opacitySlider.addEventListener("input", () => {
            //set opacity val and update filter
            opacityPercent.innerHTML = `${Math.round(opacitySlider.value * 100)}%`;
            vidMap[videos[i].index].pf.opacity = opacitySlider.value;
            opacityReset.disabled = opacitySlider.value == defaults.opacity.v;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        opacityDiv.appendChild(opacityReset);
        videoEl.appendChild(opacityDiv);

        //grayscale
        const grayscaleDiv = document.createElement("div");
        const grayscaleLabel = document.createElement("label");
        grayscaleLabel.innerHTML = "Grayscale:";
        const grayscalePercent = document.createElement("span");
        grayscalePercent.innerHTML = `${Math.round(pf.grayscale * 100)}%`;
        const grayscaleSlider = document.createElement("input");
        grayscaleSlider.type = "range";
        grayscaleSlider.min = defaults.grayscale.min;
        grayscaleSlider.step = defaults.grayscale.step;
        grayscaleSlider.max = defaults.grayscale.max;
        grayscaleSlider.value = pf.grayscale;
        grayscaleDiv.appendChild(grayscaleLabel);
        grayscaleDiv.appendChild(grayscaleSlider);
        grayscaleDiv.appendChild(grayscalePercent);
        //grayscale reset button
        const grayscaleReset = document.createElement("button");
        grayscaleReset.disabled = pf.grayscale == defaults.grayscale.v;
        grayscaleReset.addEventListener("click", () => {
            grayscaleSlider.value = 0;
            grayscalePercent.innerHTML = `${Math.round(grayscaleSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.grayscale = grayscaleSlider.value;
            grayscaleReset.disabled = true;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        grayscaleSlider.addEventListener("input", () => {
            //set grayscale val and update filter
            grayscalePercent.innerHTML = `${Math.round(grayscaleSlider.value * 100)}%`;
            vidMap[videos[i].index].pf.grayscale = grayscaleSlider.value;
            grayscaleReset.disabled = grayscaleSlider.value == defaults.grayscale.v;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        grayscaleDiv.appendChild(grayscaleReset);
        videoEl.appendChild(grayscaleDiv);

        //hueRotate
        const hueRotateDiv = document.createElement("div");
        const hueRotateLabel = document.createElement("label");
        hueRotateLabel.innerHTML = "Hue:";
        const hueRotateDegree = document.createElement("span");
        hueRotateDegree.innerHTML = `${pf.hueRotate} deg`;
        const hueRotateSlider = document.createElement("input");
        hueRotateSlider.type = "range";
        hueRotateSlider.min = defaults.hueRotate.min;
        hueRotateSlider.step = defaults.hueRotate.step;
        hueRotateSlider.max = defaults.hueRotate.max;
        hueRotateSlider.value = pf.hueRotate;
        hueRotateDiv.appendChild(hueRotateLabel);
        hueRotateDiv.appendChild(hueRotateSlider);
        hueRotateDiv.appendChild(hueRotateDegree);
        //hueRotate reset button
        const hueRotateReset = document.createElement("button");
        hueRotateReset.disabled = pf.hueRotate == defaults.hueRotate.v;
        hueRotateReset.addEventListener("click", () => {
            hueRotateSlider.value = 0;
            hueRotateDegree.innerHTML = `${hueRotateSlider.value} deg`;
            vidMap[videos[i].index].pf.hueRotate = hueRotateSlider.value;
            hueRotateReset.disabled = true;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        hueRotateSlider.addEventListener("input", () => {
            //set hueRotate val and update filter
            hueRotateDegree.innerHTML = `${hueRotateSlider.value} deg`;
            vidMap[videos[i].index].pf.hueRotate = hueRotateSlider.value;
            hueRotateReset.disabled = hueRotateSlider.value == defaults.hueRotate.v;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        hueRotateDiv.appendChild(hueRotateReset);
        videoEl.appendChild(hueRotateDiv);

        //blur
        const blurDiv = document.createElement("div");
        const blurLabel = document.createElement("label");
        blurLabel.innerHTML = "Blur:";
        const blurPixels = document.createElement("span");
        blurPixels.innerHTML = `${pf.blur} px`;
        const blurSlider = document.createElement("input");
        blurSlider.type = "range";
        blurSlider.min = defaults.blur.min;
        blurSlider.step = defaults.blur.step;
        blurSlider.max = defaults.blur.max;
        blurSlider.value = pf.blur;
        blurDiv.appendChild(blurLabel);
        blurDiv.appendChild(blurSlider);
        blurDiv.appendChild(blurPixels);
        //blur reset button
        const blurReset = document.createElement("button");
        blurReset.disabled = pf.blur == defaults.blur.v;
        blurReset.addEventListener("click", () => {
            blurSlider.value = 0;
            blurPixels.innerHTML = `${blurSlider.value} px`;
            vidMap[videos[i].index].pf.blur = blurSlider.value;
            blurReset.disabled = true;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        blurSlider.addEventListener("input", () => {
            //set blur val and update filter
            blurPixels.innerHTML = `${blurSlider.value} px`;
            vidMap[videos[i].index].pf.blur = blurSlider.value;
            blurReset.disabled = blurSlider.value == defaults.blur.v;
            setFilter(videos[i].index, vidMap[videos[i].index]);
        });
        blurDiv.appendChild(blurReset);
        videoEl.appendChild(blurDiv);
    }
    function addPlaybackRateElement(videos, i, videoEl) {
        //playback rate
        const playbackRateDiv = document.createElement("div");
        const playbackRateLabel = document.createElement("label");
        playbackRateLabel.innerHTML = "Speed:";
        const playbackRateMultiplier = document.createElement("span");
        playbackRateMultiplier.innerHTML = `${videos[i].playbackRate}x`;
        const playbackRateSlider = document.createElement("input");
        playbackRateSlider.type = "range";
        playbackRateSlider.min = defaults.playbackRate.min;
        playbackRateSlider.step = defaults.playbackRate.step;
        playbackRateSlider.max = defaults.playbackRate.max;
        playbackRateSlider.value = videos[i].playbackRate;
        playbackRateDiv.appendChild(playbackRateLabel);
        playbackRateDiv.appendChild(playbackRateSlider);
        playbackRateDiv.appendChild(playbackRateMultiplier);
        //playback rate reset button
        const playbackRateReset = document.createElement("button");
        playbackRateReset.disabled = videos[i].playbackRate == defaults.playbackRate.v;
        playbackRateReset.addEventListener("click", () => {
            playbackRateSlider.value = 1;
            playbackRateMultiplier.innerHTML = `${playbackRateSlider.value}x`;
            vidMap[videos[i].index].playbackRate = playbackRateSlider.value;
            playbackRateReset.disabled = true;
            setPlaybackRate(videos[i].index, vidMap[videos[i].index]);
        });
        playbackRateSlider.addEventListener("input", () => {
            //set playbackRate val and update playbackRate
            playbackRateMultiplier.innerHTML = `${playbackRateSlider.value}x`;
            vidMap[videos[i].index].playbackRate = playbackRateSlider.value;
            playbackRateReset.disabled = playbackRateSlider.value == defaults.playbackRate.v;
            setPlaybackRate(videos[i].index, vidMap[videos[i].index]);
        });
        playbackRateDiv.appendChild(playbackRateReset);
        videoEl.appendChild(playbackRateDiv);
    }

    function setFilter(index, video) {
        const filter = video.pf;
        chrome.storage.local.set({ videoStyleFilter: pfToString(filter) });
        chrome.storage.local.set({ videoIndex: index });
        chrome.storage.local.set({ frameUri: video.uri });
        chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            function: () => {
                chrome.storage.local.get('frameUri', (data) => {
                    if (window.location.href !== data.frameUri) return;
                    chrome.storage.local.get('videoIndex', (videoIndex) => {
                        const vid = document.querySelectorAll('video').item(videoIndex.videoIndex);
                        chrome.storage.local.get('videoStyleFilter', (videoStyleFilter) => {
                            vid.style.filter = videoStyleFilter.videoStyleFilter;
                        });
                    });
                });
            },
        }, _ => !chrome.runtime.lastError || console.log("Error(setFilter): ", chrome.runtime.lastError));
    }
    function setPlaybackRate(index, video) {
        const playbackRate = video.playbackRate;
        chrome.storage.local.set({ videoPlaybackRate: playbackRate });
        chrome.storage.local.set({ videoIndex: index });
        chrome.storage.local.set({ frameUri: video.uri });
        chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            function: () => {
                chrome.storage.local.get('frameUri', (data) => {
                    if (window.location.href !== data.frameUri) return;
                    chrome.storage.local.get('videoIndex', (videoIndex) => {
                        const vid = document.querySelectorAll('video').item(videoIndex.videoIndex);
                        chrome.storage.local.get('videoPlaybackRate', (videoPlaybackRate) => {
                            vid.playbackRate = videoPlaybackRate.videoPlaybackRate;
                        });
                    });
                });
            },
        }, _ => !chrome.runtime.lastError || console.log('Error(setPlayBackRate): ', chrome.runtime.lastError));
    }
    function reqPIP(index, video) {
        chrome.storage.local.set({ videoIndex: index });
        chrome.storage.local.set({ frameUri: video.uri });
        chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            function: () => {
                chrome.storage.local.get('frameUri', (data) => {
                    if (window.location.href !== data.frameUri) return;
                    chrome.storage.local.get('videoIndex', (videoIndex) => {
                        const vid = document.querySelectorAll('video').item(videoIndex.videoIndex);
                        if (document.pipIndex !== videoIndex.videoIndex || !document.pictureInPictureElement) {
                            vid.requestPictureInPicture().then(() => {
                                document.pipIndex = videoIndex.videoIndex;
                            });
                        } else {
                            document.exitPictureInPicture();
                            document.pipIndex = null;
                        }
                    });
                });
            },
        }, _ => !chrome.runtime.lastError || console.log("Error(reqPIP): ", chrome.runtime.lastError));
    }

    function parseFilter(fltr) {
        // TODO replace regex with a proper parser?
        //  feature = (regex between the parentheses || [0, default]) [capture group]
        let blur = (fltr.match(/blur\((.*?)\)/m) || [0, "0"])[1];
        let brightness = (fltr.match(/brightness\((.*?)\)/m) || [0, "1"])[1];
        let contrast = (fltr.match(/contrast\((.*?)\)/m) || [0, "1"])[1];
        let grayscale = (fltr.match(/grayscale\((.*?)\)/m) || [0, "0"])[1];
        let hueRotate = (fltr.match(/hue-rotate\((.*?)\)/m) || [0, "0"])[1];
        let invert = (fltr.match(/invert\((.*?)\)/m) || [0, "0"])[1];
        let opacity = (fltr.match(/opacity\((.*?)\)/m) || [0, "1"])[1];
        let saturate = (fltr.match(/saturate\((.*?)\)/m) || [0, "1"])[1];
        let sepia = (fltr.match(/sepia\((.*?)\)/m) || [0, "0"])[1];

        if (blur.includes("px")) {
            blur = parseInt(blur.replace("px", ""));
        }
        if (brightness.includes("%")) {
            brightness = parseInt(brightness.replace("%", "")) / 100;
        }
        if (contrast.includes("%")) {
            contrast = parseInt(contrast.replace("%", "")) / 100;
        }
        if (grayscale.includes("%")) {
            grayscale = parseInt(grayscale.replace("%", "")) / 100;
        }
        if (hueRotate.includes("deg")) {
            hueRotate = parseInt(hueRotate.replace("deg", ""));
        }
        if (invert.includes("%")) {
            invert = parseInt(invert.replace("%", "")) / 100;
        }
        if (opacity.includes("%")) {
            opacity = parseInt(opacity.replace("%", "")) / 100;
        }
        if (saturate.includes("%")) {
            saturate = parseInt(saturate.replace("%", "")) / 100;
        }
        if (sepia.includes("%")) {
            sepia = parseInt(sepia.replace("%", "")) / 100;
        }
        return { blur, brightness, contrast, grayscale, hueRotate, invert, opacity, saturate, sepia };
    }

    // turns the filter object into a string suitable for setting the style.filter property
    function pfToString(pf) {
        return `blur(${pf.blur}px) brightness(${pf.brightness}) contrast(${pf.contrast}) saturate(${pf.saturate}) invert(${pf.invert}) sepia(${pf.sepia}) opacity(${pf.opacity}) grayscale(${pf.grayscale}) hue-rotate(${pf.hueRotate}deg)`;
    }
}

// TODO: when chrome.* stops using callbacks refactor this to use promises 
chrome.storage.sync.get('defaults', defaults => {
    main(defaults.defaults);
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}