// HiChord firmware uploader - adapted from Electro-Smith Programmer
// Uses exact DFU logic with pre-loaded binary files

var firmwareFile = null;
var bootloaderFirmwareFile = null;
var device = null;

(function() {
    'use strict';

    function hex4(n) {
        let s = n.toString(16)
        while (s.length < 4) {
            s = '0' + s;
        }
        return s;
    }

    function hexAddr8(n) {
        let s = n.toString(16)
        while (s.length < 8) {
            s = '0' + s;
        }
        return "0x" + s;
    }

    function niceSize(n) {
        const gigabyte = 1024 * 1024 * 1024;
        const megabyte = 1024 * 1024;
        const kilobyte = 1024;
        if (n >= gigabyte) {
            return n / gigabyte + "GiB";
        } else if (n >= megabyte) {
            return n / megabyte + "MiB";
        } else if (n >= kilobyte) {
            return n / kilobyte + "KiB";
        } else {
            return n + "B";
        }
    }

    function formatDFUSummary(device) {
        const vid = hex4(device.device_.vendorId);
        const pid = hex4(device.device_.productId);
        const name = device.device_.productName;

        let mode = "Unknown"
        if (device.settings.alternate.interfaceProtocol == 0x01) {
            mode = "Runtime";
        } else if (device.settings.alternate.interfaceProtocol == 0x02) {
            mode = "DFU";
        }

        const cfg = device.settings.configuration.configurationValue;
        const intf = device.settings["interface"].interfaceNumber;
        const alt = device.settings.alternate.alternateSetting;
        const serial = device.device_.serialNumber;
        let info = `${mode}: [${vid}:${pid}] cfg=${cfg}, intf=${intf}, alt=${alt}, name="${name}" serial="${serial}"`;
        return info;
    }

    async function fixInterfaceNames(device_, interfaces) {
        // Check if any interface names were not read correctly
        if (interfaces.some(intf => (intf.name == null))) {
            // Manually retrieve the interface name string descriptors
            let tempDevice = new dfu.Device(device_, interfaces[0]);
            await tempDevice.device_.open();
            await tempDevice.device_.selectConfiguration(1);
            let mapping = await tempDevice.readInterfaceNames();
            await tempDevice.close();

            for (let intf of interfaces) {
                if (intf.name === null) {
                    let configIndex = intf.configuration.configurationValue;
                    let intfNumber = intf["interface"].interfaceNumber;
                    let alt = intf.alternate.alternateSetting;
                    intf.name = mapping[configIndex][intfNumber][alt];
                }
            }
        }
    }

    function getDFUDescriptorProperties(device) {
        // Attempt to read the DFU functional descriptor
        return device.readConfigurationDescriptor(0).then(
            data => {
                let configDesc = dfu.parseConfigurationDescriptor(data);
                let funcDesc = null;
                let configValue = device.settings.configuration.configurationValue;
                if (configDesc.bConfigurationValue == configValue) {
                    for (let desc of configDesc.descriptors) {
                        if (desc.bDescriptorType == 0x21 && desc.hasOwnProperty("bcdDFUVersion")) {
                            funcDesc = desc;
                            break;
                        }
                    }
                }

                if (funcDesc) {
                    return {
                        WillDetach:            ((funcDesc.bmAttributes & 0x08) != 0),
                        ManifestationTolerant: ((funcDesc.bmAttributes & 0x04) != 0),
                        CanUpload:             ((funcDesc.bmAttributes & 0x02) != 0),
                        CanDnload:             ((funcDesc.bmAttributes & 0x01) != 0),
                        TransferSize:          funcDesc.wTransferSize,
                        DetachTimeOut:         funcDesc.wDetachTimeOut,
                        DFUVersion:            funcDesc.bcdDFUVersion
                    };
                } else {
                    return {};
                }
            },
            error => {}
        );
    }

    // Current log div element to append to
    let logContext = null;

    function setLogContext(div) {
        logContext = div;
    };

    function clearLog(context) {
        if (typeof context === 'undefined') {
            context = logContext;
        }
        if (context) {
            context.innerHTML = "";
        }
    }

    function logDebug(msg) {
        console.log(msg);
    }

    function logInfo(msg) {
        if (logContext) {
            let info = document.createElement("p");
            info.className = "info";
            info.textContent = msg;
            logContext.appendChild(info);
        }
    }

    function logWarning(msg) {
        if (logContext) {
            let warning = document.createElement("p");
            warning.className = "warning";
            warning.textContent = msg;
            logContext.appendChild(warning);
        }
    }

    function logError(msg) {
        if (logContext) {
            let error = document.createElement("p");
            error.className = "error";
            error.textContent = msg;
            logContext.appendChild(error);
        }
    }

    function logProgress(done, total) {
        if (logContext) {
            let progressBar;
            if (logContext.lastChild && logContext.lastChild.tagName.toLowerCase() == "progress") {
                progressBar = logContext.lastChild;
            }
            if (!progressBar) {
                progressBar = document.createElement("progress");
                logContext.appendChild(progressBar);
            }
            progressBar.value = done;
            if (typeof total !== 'undefined') {
                progressBar.max = total;
            }
        }
    }

    document.addEventListener('DOMContentLoaded', event => {
        let connectButton = document.querySelector("#connect");
        let connect2Button = document.querySelector("#connect2");
        let bootloaderButton = document.querySelector("#bootloader");
        let downloadButton = document.querySelector("#download");
        let statusDisplay = document.querySelector("#status");
        let downloadLog = document.querySelector("#downloadLog");
        let downloadLog2 = document.querySelector("#downloadLog2");
        let step1 = document.querySelector("#step1");
        let step2 = document.querySelector("#step2");

        let transferSize = 1024;
        let manifestationTolerant = true;
        const vid = 0x0483; // STM32 DFU vendor ID

        // Load binary files on page load
        setLogContext(downloadLog);

        // Load bootloader
        fetch('boot/dsy_bootloader_v6_2-extdfu-10ms.bin')
            .then(response => response.arrayBuffer())
            .then(buffer => {
                bootloaderFirmwareFile = buffer;
                console.log(`Loaded bootloader: ${niceSize(bootloaderFirmwareFile.byteLength)}`);
            })
            .catch(error => {
                console.error('Failed to load bootloader:', error);
            });

        // Load firmware
        fetch('firmware/hichord_unified.bin')
            .then(response => response.arrayBuffer())
            .then(buffer => {
                firmwareFile = buffer;
                console.log(`Loaded firmware: ${niceSize(firmwareFile.byteLength)}`);
            })
            .catch(error => {
                console.error('Failed to load firmware:', error);
            });

        function onDisconnect(reason) {
            if (reason) {
                statusDisplay.textContent = reason;
            }

            if (connectButton) connectButton.textContent = "CONNECT";
            if (connect2Button) connect2Button.textContent = "CONNECT";
            bootloaderButton.disabled = true;
            downloadButton.disabled = true;
        }

        function onUnexpectedDisconnect(event) {
            if (device !== null && device.device_ !== null) {
                if (device.device_ === event.device) {
                    device.disconnected = true;
                    onDisconnect("Device disconnected");
                    device = null;
                }
            }
        }

        async function connect(device) {
            try {
                await device.open();
            } catch (error) {
                onDisconnect(error);
                throw error;
            }

            // Attempt to parse the DFU functional descriptor
            let desc = {};
            try {
                desc = await getDFUDescriptorProperties(device);
            } catch (error) {
                onDisconnect(error);
                throw error;
            }

            let memorySummary = "";
            if (desc && Object.keys(desc).length > 0) {
                device.properties = desc;
                transferSize = desc.TransferSize;
                if (desc.CanDnload) {
                    manifestationTolerant = desc.ManifestationTolerant;
                }

                // CRITICAL: Create dfuse.Device for DfuSe protocol (line 354 from original)
                if (desc.DFUVersion == 0x011a && device.settings.alternate.interfaceProtocol == 0x02) {
                    device = new dfuse.Device(device.device_, device.settings);
                    if (device.memoryInfo) {
                        let totalSize = 0;
                        for (let segment of device.memoryInfo.segments) {
                            totalSize += segment.end - segment.start;
                        }
                        memorySummary = `Selected memory region: ${device.memoryInfo.name} (${niceSize(totalSize)})`;
                        for (let segment of device.memoryInfo.segments) {
                            let properties = [];
                            if (segment.readable) {
                                properties.push("readable");
                            }
                            if (segment.erasable) {
                                properties.push("erasable");
                            }
                            if (segment.writable) {
                                properties.push("writable");
                            }
                            let propertySummary = properties.join(", ");
                            if (!propertySummary) {
                                propertySummary = "inaccessible";
                            }

                            memorySummary += `\n${hexAddr8(segment.start)}-${hexAddr8(segment.end-1)} (${propertySummary})`;
                        }
                    }
                }
            }

            // Bind logging methods
            device.logDebug = logDebug;
            device.logInfo = logInfo;
            device.logWarning = logWarning;
            device.logError = logError;
            device.logProgress = logProgress;

            // Clear logs
            clearLog(downloadLog);

            // Display basic USB information
            statusDisplay.textContent = 'Connected: ' + device.device_.productName;
            if (connectButton && !connectButton.classList.contains('used')) {
                connectButton.textContent = 'Disconnect';
            }
            if (connect2Button && !connect2Button.classList.contains('used')) {
                connect2Button.textContent = 'Disconnect';
            }

            // CRITICAL: Set start address with QSPI offset (lines 432-433 from original)
            if (device.memoryInfo) {
                let segment = device.getFirstWritableSegment();
                if (segment) {
                    if(segment.start === 0x90000000)
                        segment.start += 0x40000  // Makes it 0x90040000
                    device.startAddress = segment.start;
                }
            }

            // Enable upload buttons
            bootloaderButton.disabled = false;
            downloadButton.disabled = false;

            return device;
        }

        // CRITICAL: Interface selection filtering (line 532 from original)
        async function handleConnect(button) {
            if (device) {
                device.close().then(onDisconnect);
                device = null;
            } else {
                let filters = [{ 'vendorId': vid }];
                navigator.usb.requestDevice({ 'filters': filters }).then(
                    async selectedDevice => {
                        let interfaces = dfu.findDeviceDfuInterfaces(selectedDevice);
                        if (interfaces.length == 0) {
                            statusDisplay.textContent = "The selected device does not have any USB DFU interfaces.";
                        } else if (interfaces.length == 1) {
                            await fixInterfaceNames(selectedDevice, interfaces);
                            device = await connect(new dfu.Device(selectedDevice, interfaces[0]));
                            button.classList.add('used');
                        } else {
                            await fixInterfaceNames(selectedDevice, interfaces);
                            // CRITICAL LINE 532: Filter by internal flash address
                            let filteredInterfaceList = interfaces.filter(ifc => ifc.name.includes("0x08000000"))
                            if (filteredInterfaceList.length === 0) {
                                console.log("No interface with flash address 0x08000000 found.")
                                statusDisplay.textContent = "The selected device does not have a Flash Memory section at address 0x08000000.";
                            } else {
                                device = await connect(new dfu.Device(selectedDevice, filteredInterfaceList[0]));
                                button.classList.add('used');
                            }
                        }
                    }
                ).catch(error => {
                    statusDisplay.textContent = error;
                });
            }
        }

        connectButton.addEventListener('click', () => handleConnect(connectButton));
        connect2Button.addEventListener('click', () => handleConnect(connect2Button));

        // EXACT COPY from Electro-Smith bootloader button (lines 620-662)
        bootloaderButton.addEventListener('click', async function(event) {
            event.preventDefault();
            event.stopPropagation();

            if (device && bootloaderFirmwareFile != null) {
                downloadLog.classList.remove('hidden');
                setLogContext(downloadLog);
                clearLog(downloadLog);

                // Clear any error state first
                try {
                    let state = await device.getState();
                    if (state == dfu.dfuERROR) {
                        await device.clearStatus();
                    }
                } catch (error) {
                    // Ignore errors getting initial state
                }

                // Ensure we're in IDLE state before starting
                try {
                    let status = await device.getStatus();
                    if (status.state != dfu.dfuIDLE) {
                        await device.abortToIdle();
                    }
                } catch (error) {
                    logWarning("Failed to check device state: " + error);
                }

                // CRITICAL LINE 639: Upload bootloader using do_download
                await device.do_download(transferSize, bootloaderFirmwareFile, manifestationTolerant).then(
                    () => {
                        logInfo("Done! Bootloader installed.");
                        logInfo("Now proceed to STEP 2 below to upload firmware.");
                        step2.classList.add('active');
                        setLogContext(null);
                        if (!manifestationTolerant) {
                            device.waitDisconnected(5000).then(
                                dev => {
                                    onDisconnect();
                                    device = null;
                                },
                                error => {
                                    // It didn't reset and disconnect for some reason...
                                    console.log("Device unexpectedly tolerated manifestation.");
                                }
                            );
                        }
                    },
                    error => {
                        // Suppress "DFU GETSTATUS failed" errors after successful upload (device resets)
                        if (error.toString().includes('GETSTATUS failed') || error.toString().includes('ControlTransferIn failed')) {
                            logInfo("Done! Bootloader installed.");
                            logInfo("Now proceed to STEP 2 below to upload firmware.");
                            step2.classList.add('active');
                        } else {
                            logError(error);
                        }
                        setLogContext(null);
                    }
                )
            }
        });

        // EXACT COPY from Electro-Smith download button (lines 709-753)
        downloadButton.addEventListener('click', async function(event) {
            event.preventDefault();
            event.stopPropagation();

            if (device && firmwareFile != null) {
                downloadLog2.classList.remove('hidden');
                setLogContext(downloadLog2);
                clearLog(downloadLog2);

                // Clear any error state first
                try {
                    let state = await device.getState();
                    if (state == dfu.dfuERROR) {
                        await device.clearStatus();
                    }
                } catch (error) {
                    // Ignore errors getting initial state
                }

                // Ensure we're in IDLE state before starting
                try {
                    let status = await device.getStatus();
                    if (status.state != dfu.dfuIDLE) {
                        await device.abortToIdle();
                    }
                } catch (error) {
                    logWarning("Failed to check device state: " + error);
                }

                // CRITICAL LINE 728: Upload firmware using do_download
                await device.do_download(transferSize, firmwareFile, manifestationTolerant).then(
                    () => {
                        logInfo("Done! Firmware programming complete.");
                        logInfo("Device will automatically reset and boot your firmware.");
                        setLogContext(null);
                        if (!manifestationTolerant) {
                            device.waitDisconnected(5000).then(
                                dev => {
                                    onDisconnect();
                                    device = null;
                                },
                                error => {
                                    // It didn't reset and disconnect for some reason...
                                    console.log("Device unexpectedly tolerated manifestation.");
                                }
                            );
                        }
                    },
                    error => {
                        // Suppress "DFU GETSTATUS failed" errors after successful upload (device resets)
                        if (error.toString().includes('GETSTATUS failed') || error.toString().includes('ControlTransferIn failed')) {
                            logInfo("Done! Firmware programming complete.");
                            logInfo("Device will automatically reset and boot your firmware.");
                        } else {
                            logError(error);
                        }
                        setLogContext(null);
                    }
                )
            }
        });

        // Check if WebUSB is available
        if (typeof navigator.usb !== 'undefined') {
            navigator.usb.addEventListener("disconnect", onUnexpectedDisconnect);
        } else {
            statusDisplay.textContent = 'WebUSB not available.'
            connectButton.disabled = true;
        }
    });
})();
