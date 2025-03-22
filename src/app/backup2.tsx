'use client';
import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { WebglPlot, ColorRGBA, WebglLine } from "webgl-plot";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { EXGFilter, Notch } from '@/components/filters';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CircleX,
  CircleOff,
  ReplaceAll,
  Heart,
  Brain,
  Eye,
  BicepsFlexed,
  Loader
} from "lucide-react";
import { useTheme } from "next-themes";


const Websocket = () => {
  // UI States for Popovers and Buttons
  const sampingrateref = useRef<number>(250);
  const endTimeRef = useRef<number | null>(null); // Ref to store the end time of the recording
  // Canvas Settings & Channels
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  // Buffer Management
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const dataPointCountRef = useRef<number>(2000); // To track the calculated value
  const sweepPositions = useRef<number[]>(new Array(6).fill(0)); // Array for sweep positions
  const currentSweepPos = useRef<number[]>(new Array(6).fill(0)); // Array for sweep positions
  const maxCanvasElementCountRef = useRef<number>(3);
  const channelNames = Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => `CH${i + 1}`);
  let numChannels = 3;
  const [selectedChannels, setSelectedChannels] = useState<number[]>([0, 1, 2]);
  const { theme } = useTheme(); // Current theme of the app
  const isDarkModeEnabled = theme === "dark"; // Boolean to check if dark mode is enabled
  const [isConnected, setIsConnected] = useState(false);
  const activeTheme: 'light' | 'dark' = isDarkModeEnabled ? 'dark' : 'light';
  const [isAllEnabledChannelSelected, setIsAllEnabledChannelSelected] = useState(false);
  const [isSelectAllDisabled, setIsSelectAllDisabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Track loading state for asynchronous operations
  const [open, setOpen] = useState(false);
  const selectedChannelsRef = useRef(selectedChannels);
  const [Zoom, SetZoom] = useState<number>(1); // Number of canvases
  const [timeBase, setTimeBase] = useState<number>(10); // To track the current index to show
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();
  const bandColors = useMemo(
    () => ["red", "yellow", "green"],
    []
  );
  const bandNames = useMemo(
    () => ["CH0", "CH1", "CH2"],
    []
  );
  const [powerThreshold1, setThreshold1] = useState(0.1);
  const [powerThreshold2, setThreshold2] = useState(0.4);

  ///
  const [bandPowerData, setBandPowerData] = useState<number[]>(
    Array(3).fill(-100)
  );
  const NUM_POINTS = 2500; // Number of points per line

  const wglpRefs = useRef<WebglPlot[]>([]);
  const linesRefs = useRef<WebglLine[][]>([]); // Now it's an array of arrays

  const createCanvasElements = () => {
    const container = canvasContainerRef.current;
    if (!container) {
      return; // Exit if the ref is null
    }
    currentSweepPos.current = new Array(numChannels).fill(0);
    sweepPositions.current = new Array(numChannels).fill(0);

    // Clear existing child elements
    while (container.firstChild) {
      const firstChild = container.firstChild;
      if (firstChild instanceof HTMLCanvasElement) {
        const gl = firstChild.getContext("webgl");
        if (gl) {
          const loseContext = gl.getExtension("WEBGL_lose_context");
          if (loseContext) {
            loseContext.loseContext();
          }
        }
      }
      container.removeChild(firstChild);
    }
    const canvasWrapper1 = document.createElement("div");
    canvasWrapper1.className = "absolute inset-0";
    const opacityDarkMajor = "0.2";
    const opacityDarkMinor = "0.05";
    const opacityLightMajor = "0.4";
    const opacityLightMinor = "0.1";
    const distanceminor = 500 * 0.04;
    const numGridLines = (500 * 4) / distanceminor;

    for (let j = 1; j < numGridLines; j++) {
      const gridLineX = document.createElement("div");
      gridLineX.className = "absolute bg-[rgb(128,128,128)]";
      gridLineX.style.width = "1px";
      gridLineX.style.height = "100%";
      gridLineX.style.left = `${((j / numGridLines) * 100).toFixed(3)}%`;
      gridLineX.style.opacity = j % 5 === 0 ? (theme === "dark" ? opacityDarkMajor : opacityLightMajor) : (theme === "dark" ? opacityDarkMinor : opacityLightMinor);
      canvasWrapper1.appendChild(gridLineX);
    }

    const horizontalline = 50;
    for (let j = 1; j < horizontalline; j++) {
      const gridLineY = document.createElement("div");
      gridLineY.className = "absolute bg-[rgb(128,128,128)]";
      gridLineY.style.height = "1px";
      gridLineY.style.width = "100%";
      gridLineY.style.top = `${((j / horizontalline) * 100).toFixed(3)}%`;
      gridLineY.style.opacity = j % 5 === 0 ? (theme === "dark" ? opacityDarkMajor : opacityLightMajor) : (theme === "dark" ? opacityDarkMinor : opacityLightMinor);
      canvasWrapper1.appendChild(gridLineY);
    }
    container.appendChild(canvasWrapper1);

    // Create canvasElements for each selected channel
    selectedChannels.forEach((channelNumber, index) => {
      const canvasWrapper = document.createElement("div");
      canvasWrapper.className = "canvas-container relative flex-[1_1_0%]";

      const canvas = document.createElement("canvas");
      canvas.id = `canvas${channelNumber}`;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight / selectedChannels.length;
      canvas.className = "w-full h-full block rounded-xl";

      const badge = document.createElement("div");
      badge.className = "absolute text-gray-500 text-sm rounded-full p-2 m-2";
      badge.innerText = `CH${channelNumber}`;

      canvasWrapper.appendChild(badge);
      canvasWrapper.appendChild(canvas);
      container.appendChild(canvasWrapper);

      const wglp = new WebglPlot(canvas);
      if (!canvas) return;

      // Ensure linesRefs.current[index] is initialized as an array
      if (!linesRefs.current[index]) {
        linesRefs.current[index] = [];
      }

      wglpRefs.current[index] = wglp;

      // Define colors for two different data sets
      const color1 = new ColorRGBA(120, 0, 0, 1); // Red (First data)
      const color2 = new ColorRGBA(0, 1, 1, 1); // Cyan (Second data)

      // First data line
      const line1 = new WebglLine(color1, NUM_POINTS);
      line1.lineSpaceX(-1, 2 / NUM_POINTS);
      wglp.addLine(line1);

      // Second data line
      const line2 = new WebglLine(color2, NUM_POINTS);
      line2.lineSpaceX(-1, 2 / NUM_POINTS);
      wglp.addLine(line2);

      // Store references
      linesRefs.current[index][0] = line1;
      linesRefs.current[index][1] = line2;
      // Animation loop
      const animate = () => {
        wglp.update();
        requestAnimationFrame(animate);
      };
      animate();

    });
  }

  useEffect(() => {
    createCanvasElements();
  }, [numChannels, theme, timeBase, selectedChannels]);
  useEffect(() => {
    const handleResize = () => {
      createCanvasElements();

    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [createCanvasElements]);

  const updateData = (newData: number[], evn: number[]) => {
    if (!linesRefs.current.length) return;

    linesRefs.current.forEach((line, i) => {
      const line1 = linesRefs.current[i][0]; // First dataset
      const line2 = linesRefs.current[i][1]; // Second dataset

      if (!line1 || !line2) {
        console.warn(`Line at index ${i} is undefined.`);
        return;
      }

      // Ensure sweepPositions.current[i] is initialized
      if (sweepPositions.current[i] === undefined) {
        sweepPositions.current[i] = 0;
      }

      // Calculate the current position
      const currentPos = sweepPositions.current[i] % line1.numPoints;

      if (Number.isNaN(currentPos)) {
        console.error(`Invalid currentPos at index ${i}. sweepPositions.current[i]:`, sweepPositions.current[i]);
        return;
      }

      // ✅ **Plot data for both lines**
      try {
        line1.setY(currentPos, newData[i + 1]);
        line2.setY(currentPos, evn[i]);
      } catch (error) {
        console.error(`Error plotting data for line ${i} at position ${currentPos}:`, error);
      }

      // ✅ **Clear the next point for a smooth sweep effect**
      const clearPosition = Math.ceil((currentPos + dataPointCountRef.current / 100) % line1.numPoints);
      try {
        line1.setY(clearPosition, NaN);
        line2.setY(clearPosition, NaN);
      } catch (error) {
        console.error(`Error clearing data at position ${clearPosition} for line ${i}:`, error);
      }

      // ✅ **Increment the sweep position**
      sweepPositions.current[i] = (currentPos + 1) % line1.numPoints;
    });
  };

  const powerBuffer = useRef<number[][]>(bandNames.map(() => []));

  const debounceMap: Record<number, NodeJS.Timeout | null> = {
    0: null,
    1: null,
    2: null,
  };
  
  const debouncePlay = (index: number, sound: () => void, delay = 100) => {
    if (debounceMap[index]) {
      clearTimeout(debounceMap[index]!);
    }
    debounceMap[index] = setTimeout(sound, delay);
  };
  
  
  const drawGraph = useCallback(
    (currentBandPowerData: number[]) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      if (currentBandPowerData.some(isNaN)) {
        console.error("NaN values detected in band power data");
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas size to fit container
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const padding = 35; // Reduce padding to maximize space usage
      const barAreaHeight = height * 0.87;
      const infoBlockHeight = height * 0.08;
      const barWidth = width / bandNames.length; // Make bars take full width
      const barSpacing = barWidth * 0.1; // Adjust spacing between bars
      const barActualWidth = barWidth * 0.8; // Increase bar width

      const axisColor = theme === "dark" ? "white" : "black";
      const borderRadius = 8;

      currentBandPowerData.forEach((power, index) => {
        if (isNaN(power) || !isFinite(power)) return;
        if (powerBuffer.current[index].length >= 500) {
          powerBuffer.current[index].shift();
        }
        powerBuffer.current[index].push(power);
      });
      //drum
      const drum1 = new Audio("/sounds/01_1.mp3");
      const drum2 = new Audio("/sounds/1-2.mp3");
      const drum3 = new Audio("/sounds/1-3.mp3");
      const drum4 = new Audio("/sounds/1-4.mp3");
      const drum5 = new Audio("/sounds/1-5.mp3");
      const drum6 = new Audio("/sounds/1-6.mp3");

      const flute1 = new Audio("/sounds/2_1.mp3");
      const flute2 = new Audio("/sounds/2-2.mp3");
      const flute3 = new Audio("/sounds/2-3.mp3");
      const flute4 = new Audio("/sounds/2-4mp3.mp3");
      const flute5 = new Audio("/sounds/2-5..mp3");
      const flute6 = new Audio("/sounds/2-6.mp3");

      const git1 = new Audio("/sounds/3-1.mp3");
      const git2 = new Audio("/sounds/3-2.mp3");
      const git3 = new Audio("/sounds/3-3.mp3");
      const git4 = new Audio("/sounds/3-4.mp3");
      const git5 = new Audio("/sounds/3-5.mp3");
      const git6 = new Audio("/sounds/3-6.mp3");

      currentBandPowerData.forEach((power, index) => {
        const x = index * barWidth + barSpacing / 2;
        const barX = x + (barWidth - barActualWidth) / 2; // Center the bars
        const barY = height - barAreaHeight - padding;
        const barH = barAreaHeight;
        const history = powerBuffer.current[index];

        let previousMaxPower = 0; // Initialize with a small value

        const maxPower = Math.max(...history);

        if (maxPower > previousMaxPower) {
          previousMaxPower = maxPower; // Update the stored max value
        }
        let previousMinPower = 0; // Initialize with a small value

        const minPower = Math.min(...history);

        if (minPower < previousMinPower) {
          previousMaxPower = maxPower; // Update the stored max value
        }
        const avgPower = history.reduce((a, b) => a + b, 0) / history.length;
        // Info Block above bars
        const infoBlockX = barX;
        const infoBlockY = barY - infoBlockHeight;
        const infoBlockW = barActualWidth;
        const infoBlockH = infoBlockHeight;
        const sectionWidth = infoBlockW / 3; // Divide into 3 equal sections

        // Draw the full info block
        ctx.fillStyle = theme === "dark" ? "#020817" : "#FFFFFF";
        ctx.beginPath();
        ctx.roundRect(infoBlockX, infoBlockY, infoBlockW, infoBlockH, [borderRadius, borderRadius, 0, 0]);
        ctx.fill();
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Section-wise text alignment
        const section1X = infoBlockX + sectionWidth / 2; // Left section (Max Power)
        const section2X = infoBlockX + sectionWidth + sectionWidth / 2; // Middle section (Avg Power)
        const section3X = infoBlockX + 2 * sectionWidth + sectionWidth / 2; // Right section (Min Power)

        ctx.fillStyle = axisColor;
        ctx.font = `${20 * (canvas.width / 800)}px bold Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Draw text in three sections
        ctx.fillText(`▲ `, section1X, (infoBlockY + infoBlockH / 2) - 8);
        ctx.fillText(`~ `, section2X, (infoBlockY + infoBlockH / 2) - 8);
        ctx.fillText(`▼ `, section3X, (infoBlockY + infoBlockH / 2) - 8);

        ctx.fillText(`${Math.abs(maxPower).toFixed(2)}`, section1X, (infoBlockY + infoBlockH / 2) + 15);
        ctx.fillText(`${Math.abs(avgPower).toFixed(2)}`, section2X, (infoBlockY + infoBlockH / 2) + 15);
        ctx.fillText(`${Math.abs(minPower).toFixed(2)}`, section3X, (infoBlockY + infoBlockH / 2) + 15);

        // Optional: Draw vertical dividers between sections
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(infoBlockX + sectionWidth, infoBlockY);
        ctx.lineTo(infoBlockX + sectionWidth, infoBlockY + infoBlockH);
        ctx.moveTo(infoBlockX + 2 * sectionWidth, infoBlockY);
        ctx.lineTo(infoBlockX + 2 * sectionWidth, infoBlockY + infoBlockH);
        ctx.stroke();

        // Play sound based on threshold
        // if (power > powerThreshold2) {
        //   if (index === 0) drum1.play(); // Band 1 high power
        //   else if (index === 1) drum3.play(); // Band 2 high power
        //   else if (index === 2) drum5.play(); // Band 3 high power
        // } else if (power > powerThreshold1) {
        //   if (index === 0) drum2.play(); // Band 1 medium power
        //   else if (index === 1) drum4.play(); // Band 2 medium power
        //   else if (index === 2) drum6.play(); // Band 3 medium power
        // }
        if (power > powerThreshold2) {
          if (index === 0) {
            debouncePlay(0, () => drum2.play());
          } else if (index === 1) {
            debouncePlay(1, () => flute4.play());
          } else if (index === 2) {
            debouncePlay(2, () => git6.play());
          }
        } else if (power > powerThreshold1) {
          if (index === 0) {
            debouncePlay(0, () => drum1.play());
          } else if (index === 1) {
            debouncePlay(1, () => flute3.play());
          } else if (index === 2) {
            debouncePlay(2, () => git5.play());
          }
        }
        // Bar height based on power value
        const normalizedHeight = power;
        const actualBarHeight = Math.max(normalizedHeight * barH, 2); // Set minimum height

        // Gradient color based on height
        const gradient = ctx.createLinearGradient(barX, barY + barH, barX, barY + barH - actualBarHeight);
        const oneThird = barH / 3;
        const twoThirds = (2 * barH) / 3;

        if (actualBarHeight <= oneThird) {
          gradient.addColorStop(0, "green");
          gradient.addColorStop(1, "green");
        } else if (actualBarHeight <= twoThirds) {
          gradient.addColorStop(0, "green");
          gradient.addColorStop(oneThird / actualBarHeight, "green");
          gradient.addColorStop(1, "yellow");
        } else {
          gradient.addColorStop(0, "green");
          gradient.addColorStop(oneThird / actualBarHeight, "green");
          gradient.addColorStop(twoThirds / actualBarHeight, "yellow");
          gradient.addColorStop(1, "red");
        }
        // Background block for bars
        ctx.fillStyle = theme === "dark" ? "#020817" : "#FFFFFF";
        ctx.beginPath();
        ctx.roundRect(barX, barY, barActualWidth, barH, [0, 0, 0, 0]);
        ctx.fill();
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Actual Bar with gradient
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(barX, barY + barH - actualBarHeight, barActualWidth, actualBarHeight, [0, 0, 0, 0]);
        ctx.fill();
        // X-Axis Labels (Centered under bars)
        ctx.fillStyle = axisColor;
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        currentBandPowerData.forEach((_, index) => {
          const barX = index * barWidth + barSpacing / 2 + (barWidth - barActualWidth) / 2; // Align bars correctly
          const labelX = barX + barActualWidth / 2; // Center text under the bar
          const labelY = height - padding + 2;
          const labelWidth = barActualWidth;
          const labelHeight = 30;

          // Draw background rectangle with border
          ctx.fillStyle = theme === "dark" ? "#020817" : "#FFFFFF";
          ctx.beginPath();
          ctx.roundRect(barX, labelY, labelWidth, labelHeight, [0, 0, 8, 8]); // Bottom corners rounded
          ctx.fill();

          ctx.strokeStyle = axisColor;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw text (Channel labels)
          ctx.fillStyle = axisColor;
          ctx.textAlign = "center";
          ctx.fillText(`Channel${index}`, labelX, labelY + labelHeight / 2 - 5);
        });


      });


    },
    [theme, bandNames]
  );


  const prevBandPowerData = useRef<number[]>(Array(3).fill(0));

  const animateGraph = useCallback(() => {
    const interpolationFactor = 0.1;

    const currentValues = bandPowerData.map((target, i) => {
      const prev = prevBandPowerData.current[i];
      return prev + (target - prev) * interpolationFactor;
    });

    drawGraph(currentValues);
    prevBandPowerData.current = currentValues;

    animationRef.current = requestAnimationFrame(animateGraph);
  }, [bandPowerData, drawGraph]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animateGraph);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animateGraph]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = requestAnimationFrame(animateGraph);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [animateGraph]);
  useEffect(() => {
    selectedChannelsRef.current = selectedChannels;
  }, [selectedChannels]);

  let activeBufferIndex = 0;
  //filters
  const appliedFiltersRef = React.useRef<{ [key: number]: number }>({});
  const appliedEXGFiltersRef = React.useRef<{ [key: number]: number }>({});
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const [, forceEXGUpdate] = React.useReducer((x) => x + 1, 0);

  const removeEXGFilter = (channelIndex: number) => {
    delete appliedEXGFiltersRef.current[channelIndex]; // Remove the filter for the channel
    forceEXGUpdate(); // Trigger re-render

  };

  // Function to handle frequency selection
  const handleFrequencySelectionEXG = (channelIndex: number, frequency: number) => {
    appliedEXGFiltersRef.current[channelIndex] = frequency; // Update the filter for the channel
    forceEXGUpdate(); //Trigger re-render

  };

  // Function to set the same filter for all channels
  const applyEXGFilterToAllChannels = (channels: number[], frequency: number) => {
    channels.forEach((channelIndex) => {
      appliedEXGFiltersRef.current[channelIndex] = frequency; // Set the filter for the channel
    });
    forceEXGUpdate(); // Trigger re-render

  };
  // Function to remove the filter for all channels
  const removeEXGFilterFromAllChannels = (channels: number[]) => {
    channels.forEach((channelIndex) => {
      delete appliedEXGFiltersRef.current[channelIndex]; // Remove the filter for the channel
    });
    forceEXGUpdate(); // Trigger re-render

  };
  const removeNotchFilter = (channelIndex: number) => {
    delete appliedFiltersRef.current[channelIndex]; // Remove the filter for the channel
    forceUpdate(); // Trigger re-render
  };
  // Function to handle frequency selection
  const handleFrequencySelection = (channelIndex: number, frequency: number) => {
    appliedFiltersRef.current[channelIndex] = frequency; // Update the filter for the channel
    forceUpdate(); //Trigger re-render
  };

  // Function to set the same filter for all channels
  const applyFilterToAllChannels = (channels: number[], frequency: number) => {
    channels.forEach((channelIndex) => {
      appliedFiltersRef.current[channelIndex] = frequency; // Set the filter for the channel
    });
    forceUpdate(); // Trigger re-render
  };

  // Function to remove the filter for all channels
  const removeNotchFromAllChannels = (channels: number[]) => {
    channels.forEach((channelIndex) => {
      delete appliedFiltersRef.current[channelIndex]; // Remove the filter for the channel
    });
    forceUpdate(); // Trigger re-render
  };
  useEffect(() => {
    dataPointCountRef.current = (sampingrateref.current * timeBase);
  }, [timeBase]);
  const zoomRef = useRef(Zoom);

  useEffect(() => {
    zoomRef.current = Zoom;
  }, [Zoom]);

  const DEVICE_NAME = "NPG";
  const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
  const DATA_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
  const CONTROL_CHAR_UUID = "0000ff01-0000-1000-8000-00805f9b34fb";

  const SINGLE_SAMPLE_LEN = 7; // Each sample is 10 bytes
  const BLOCK_COUNT = 10; // 10 samples batched per notification
  const NEW_PACKET_LEN = SINGLE_SAMPLE_LEN * BLOCK_COUNT; // 100 bytes

  let prevSampleCounter: number | null = null;
  let samplesReceived = 0;
  let channelData: number[] = [];
  let envData: number[] = [];
  const notchFilters = Array.from(
    { length: maxCanvasElementCountRef.current },
    () => new Notch()
  );
  const EXGFilters = Array.from(
    { length: maxCanvasElementCountRef.current },
    () => new EXGFilter()
  );

  notchFilters.forEach((filter) => {
    filter.setbits(sampingrateref.current);
  });
  EXGFilters.forEach((filter) => {
    filter.setbits("12", sampingrateref.current);
  });
  function processSample(dataView: DataView): void {
    if (dataView.byteLength !== SINGLE_SAMPLE_LEN) {
      return;
    }

    // const sync1 = dataView.getUint8(0);
    // const sync2 = dataView.getUint8(1);
    const sampleCounter = dataView.getUint8(2);
    // const endByte = dataView.getUint8(9);

    // if (sync1 !== 0xC7 || sync2 !== 0x7C || endByte !== 0x01) {
    //     //   console.log(`Invalid sample header/footer: ${sync1} ${sync2} ${endByte}`);
    //     return;
    // }

    if (prevSampleCounter === null) {
      prevSampleCounter = sampleCounter;
    } else {
      const expected = (prevSampleCounter + 1) % 256;
      if (sampleCounter !== expected) {
        // console.log(`Missing sample: expected ${expected}, got ${sampleCounter}`);
      }
      prevSampleCounter = sampleCounter;
    }
    channelData.push(dataView.getUint8(0));

    for (let channel = 0; channel < numChannels; channel++) {
      const sample = dataView.getInt16(1 + (channel * 2), false);;
      channelData.push(
        notchFilters[channel].process(
          EXGFilters[channel].process(sample, appliedEXGFiltersRef.current[channel]),
          appliedFiltersRef.current[channel]
        )
      );
    }
    const env1 = envelope1.getEnvelope(Math.abs(channelData[1]));
    const env2 = envelope2.getEnvelope(Math.abs(channelData[2]));
    const env3 = envelope3.getEnvelope(Math.abs(channelData[3]));
    updateData(channelData, [env1, env2, env3]);

    setBandPowerData([env1, env2, env3]);


    channelData = [];
    envData = [];
    samplesReceived++;
  }

  interface BluetoothRemoteGATTCharacteristicExtended extends EventTarget {
    value?: DataView;
  }
  class EnvelopeFilter {
    private circularBuffer: number[];
    private sum: number = 0;
    private dataIndex: number = 0;
    private readonly bufferSize: number;

    constructor(bufferSize: number) {
      this.bufferSize = bufferSize;
      this.circularBuffer = new Array(bufferSize).fill(0);
    }

    getEnvelope(absEmg: number): number {
      this.sum -= this.circularBuffer[this.dataIndex];
      this.sum += absEmg;
      this.circularBuffer[this.dataIndex] = absEmg;
      this.dataIndex = (this.dataIndex + 1) % this.bufferSize;
      return (this.sum / this.bufferSize);
    }
  }
  const envelope1 = new EnvelopeFilter(64);
  const envelope2 = new EnvelopeFilter(64);
  const envelope3 = new EnvelopeFilter(64);

  function handledata(event: Event): void {
    const target = event.target as BluetoothRemoteGATTCharacteristicExtended;
    if (!target.value) {
      console.log("Received event with no value.");
      return;
    }
    const value = target.value;
    if (value.byteLength === NEW_PACKET_LEN) {
      for (let i = 0; i < NEW_PACKET_LEN; i += SINGLE_SAMPLE_LEN) {
        const sampleBuffer = value.buffer.slice(i, i + SINGLE_SAMPLE_LEN);
        const sampleDataView = new DataView(sampleBuffer);
        processSample(sampleDataView);
      }
    } else if (value.byteLength === SINGLE_SAMPLE_LEN) {
      processSample(new DataView(value.buffer));
    } else {
      console.log("Unexpected packet length: " + value.byteLength);
    }
  }

  const connectedDeviceRef = useRef<any | null>(null); // UseRef for device tracking

  async function connectBLE(): Promise<void> {
    try {
      setIsLoading(true);
      const nav = navigator as any;
      if (!nav.bluetooth) {
        console.log("Web Bluetooth API is not available in this browser.");
        return;
      }

      console.log("Requesting Bluetooth device...");

      const device = await nav.bluetooth.requestDevice({
        filters: [{ namePrefix: "NPG" }],
        optionalServices: [SERVICE_UUID],
      });
      console.log("Connecting to GATT Server...");
      const server = await device.gatt?.connect();
      if (!server) {
        console.log("Failed to connect to GATT Server.");
        return;
      }

      console.log("Getting Service...");
      const service = await server.getPrimaryService(SERVICE_UUID);

      console.log("Getting Control Characteristic...");
      const controlChar = await service.getCharacteristic(CONTROL_CHAR_UUID);
      console.log("Getting Data Characteristic...");
      const dataChar = await service.getCharacteristic(DATA_CHAR_UUID);

      console.log("Sending START command...");
      const encoder = new TextEncoder();
      await controlChar.writeValue(encoder.encode("START"));

      console.log("Starting notifications...");
      await dataChar.startNotifications();
      dataChar.addEventListener("characteristicvaluechanged", handledata);

      // Store the device globally for later disconnection
      connectedDeviceRef.current = device;

      setIsLoading(false);
      setIsConnected(true);

      console.log("Notifications started. Listening for data...");

      setInterval(() => {
        console.log("Samples per second: " + samplesReceived);
        if (samplesReceived === 0) {
          disconnect();
          window.location.reload();
        }
        samplesReceived = 0;
      }, 1000);
    } catch (error) {
      console.log("Error: " + (error instanceof Error ? error.message : error));
    }
  }

  async function disconnect(): Promise<void> {
    try {
      if (!connectedDeviceRef) {
        console.log("No connected device to disconnect.");
        return;
      }

      const server = connectedDeviceRef.current.gatt;
      if (!server) {
        console.log("No GATT server found.");
        return;
      }

      console.log("Checking connection status...");
      console.log("GATT Connected:", server.connected);

      if (!server.connected) {
        console.log("Device is already disconnected.");
        connectedDeviceRef.current = null;
        setIsConnected(false);
        return;
      }

      console.log("Stopping notifications...");
      const service = await server.getPrimaryService(SERVICE_UUID);
      const dataChar = await service.getCharacteristic(DATA_CHAR_UUID);
      await dataChar.stopNotifications();
      dataChar.removeEventListener("characteristicvaluechanged", handledata);

      console.log("Disconnecting from GATT Server...");
      server.disconnect(); // Disconnect the device

      console.log("Bluetooth device disconnected.");
      connectedDeviceRef.current = null; // Clear the global reference
      setIsConnected(false);
      window.location.reload();
    } catch (error) {
      console.log("Error during disconnection: " + (error instanceof Error ? error.message : error));
    }
  }




  // const [thresholds, setThresholds] = useState<number[]>(new Array(bandNames.length).fill(0.5)); // Default 0.5

  // const handleThresholdChange = (index: number, value: number) => {
  //   setThresholds(prev => {
  //     const newThresholds = [...prev];
  //     newThresholds[index] = value;
  //     return newThresholds;
  //   });
  // };



  // const [thresholds2, setThresholds2] = useState<number[]>(new Array(bandNames.length).fill(0.5)); // Default 0.5

  // const handleThresholdChange2 = (index: number, value: number) => {
  //   setThresholds2(prev => {
  //     const newThresholds = [...prev];
  //     newThresholds[index] = value;
  //     return newThresholds;
  //   });
  // };

  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [values, setValues] = useState(
    [...Array(3)].map(() => ({ lower: 20, upper: 60 })) // Create an array for each div
  ); 
   const [activeSlider, setActiveSlider] = useState<string | null>(null);
  
 
const getPercentage = (clientY: number, index: number) => {
  const ref = containerRefs.current[index];
  if (!ref) return 0;
  const rect = ref.getBoundingClientRect();
  let y = clientY - rect.top;
  y = Math.max(0, Math.min(y, rect.height));
  return (y / rect.height) * 100;
};

const handleMouseDown = (slider: "lower" | "upper", index: number) => () => {
  setActiveSlider(`${slider}-${index}`);
};

const handleMouseMove = (event: MouseEvent) => {
  if (!activeSlider) return;

  const [slider, indexStr] = activeSlider.split("-");
  const index = Number(indexStr);
  if (isNaN(index)) return;

  const desired = getPercentage(event.clientY, index);
  setValues(prevValues => {
    return prevValues.map((val, i) => {
      if (i === index) {
        return {
          lower: slider === "lower" ? Math.max(0, Math.min(desired, val.upper - 20)) : val.lower,
          upper: slider === "upper" ? Math.min(100, Math.max(desired, val.lower + 20)) : val.upper,
        };
      }
      return val;
    });
  });
};

const handleMouseUp = () => {
  setActiveSlider(null);
};

useEffect(() => {
  if (activeSlider) {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  } else {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }
  return () => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  };
}, [activeSlider]);

  return (
    <div className="flex flex-col h-screen m-0 p-0 bg-g ">
      <div className="bg-highlight">
        <Navbar isDisplay={true} />
      </div>
      <div className="flex flex-row  flex-[1_1_0%] min-h-80 rounded-2xl m-4 relative">
        {/* Left half - Charts */}
        <main className="flex flex-row w-2/3  min-h-80 bg-highlight rounded-2xl m-4 relative">
          <div className="w-full flex-row  min-h-80 bg-highlight rounded-2xl relative"
            ref={canvasContainerRef}
          >
          </div>
        </main>
        {/* Left half - Charts */}
        <main className="flex flex-row  w-1/3  min-h-80 rounded-2xl m-4 relative">
          <div className=" flex justify-center items-center">
            <div ref={containerRef} className="w-full h-full px-4 min-h-0 min-w-0">
              <canvas ref={canvasRef} className="w-full h-full" />
              {[...Array(3)].map((_, index) => (
                <div
                  key={index}
                  ref={(el) => {
                    containerRefs.current[index] = el;
                  }}
                  className="absolute  w-16 h-96 ml-24 bg-transparent"
                  style={{ top: `${ 280}px` , left: `${index * 190 }px` }}
                >
                  <div
                    className="absolute left-[-25px] right-[-25px] h-5 bg-gray-600 cursor-ns-resize rounded-md flex justify-center items-center"
                    style={{ top: `${values[index].lower}%` }}
                    onMouseDown={handleMouseDown("lower", index)}
                  >
                    <div className="w-8 h-1 bg-white rounded" />
                  </div>
                  <div
                    className="absolute left-[-25px] right-[-25px] h-5 bg-gray-600 cursor-ns-resize rounded-md flex justify-center items-center"
                    style={{ top: `${values[index].upper}%` }}
                    onMouseDown={handleMouseDown("upper", index)}
                  >
                    <div className="w-8 h-1 bg-white rounded" />
                  </div>
                </div>
              ))}


            </div>
          </div>
        </main>
      </div>

      <div className="flex-none items-center justify-center pb-4 bg-g z-10" >


        {/* Center-aligned buttons */}
        <div className="flex gap-3 items-center justify-center">
          {/* Connection button with tooltip */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      className="flex items-center gap-1 py-2 px-4 rounded-xl font-semibold"
                      onClick={() => (isConnected ? disconnect() : connectBLE())}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader size={17} className="animate-spin" />
                          Connecting...
                        </>
                      ) : isConnected ? (
                        <>
                          Disconnect
                          <CircleX size={17} />
                        </>
                      ) : (
                        <>
                          Strength Visualizer
                        </>
                      )}
                    </Button>
                  </PopoverTrigger>

                </Popover>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isConnected ? "Disconnect Device" : "Connect Device"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>


          {/* filters */}
          <Popover
            open={isFilterPopoverOpen}
            onOpenChange={setIsFilterPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button
                className="flex items-center justify-center px-3 py-2 select-none min-w-12 whitespace-nowrap rounded-xl"
              >
                Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-50 p-4 mx-4 mb-2">
              <div className="flex flex-col max-h-80 overflow-y-auto">
                <div className="flex items-center pb-2 ">
                  {/* Filter Name */}
                  <div className="text-sm font-semibold w-12"><ReplaceAll size={20} /></div>
                  {/* Buttons */}
                  <div className="flex space-x-2">
                    <div className="flex items-center border border-input rounded-xl mx-0 px-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeEXGFilterFromAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i))}
                        className={`rounded-xl rounded-r-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === 0
                            ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        <CircleOff size={17} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 4)}
                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 4)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        <BicepsFlexed size={17} />
                      </Button> <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 3)}
                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 3)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        <Brain size={17} />
                      </Button> <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 1)}
                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 1)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        <Heart size={17} />
                      </Button> <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 2)}
                        className={`rounded-xl rounded-l-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 2)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        <Eye size={17} />
                      </Button>
                    </div>
                    <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeNotchFromAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i))}
                        className={`rounded-xl rounded-r-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === 0
                            ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        <CircleOff size={17} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 1)}
                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedFiltersRef.current).every((value) => value === 1)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        50Hz
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 2)}
                        className={`rounded-xl rounded-l-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedFiltersRef.current).every((value) => value === 2)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        60Hz
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col space-y-2">
                  {channelNames.map((filterName, index) => (
                    <div key={filterName} className="flex items-center">
                      {/* Filter Name */}
                      <div className="text-sm font-semibold w-12">{filterName}</div>
                      {/* Buttons */}
                      <div className="flex space-x-2">
                        <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeEXGFilter(index)}
                            className={`rounded-xl rounded-r-none border-l-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === undefined
                                ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                : "bg-white-500" // Active background
                              }`}
                          >
                            <CircleOff size={17} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFrequencySelectionEXG(index, 4)}
                            className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === 4
                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                : "bg-white-500" // Active background
                              }`}
                          >
                            <BicepsFlexed size={17} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFrequencySelectionEXG(index, 3)}
                            className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                      ${appliedEXGFiltersRef.current[index] === 3
                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                : "bg-white-500" // Active background
                              }`}
                          >
                            <Brain size={17} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFrequencySelectionEXG(index, 1)}
                            className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === 1
                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                : "bg-white-500" // Active background
                              }`}
                          >
                            <Heart size={17} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFrequencySelectionEXG(index, 2)}
                            className={`rounded-xl rounded-l-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === 2
                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                : "bg-white-500" // Active background
                              }`}
                          >
                            <Eye size={17} />
                          </Button>
                        </div>
                        <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeNotchFilter(index)}
                            className={`rounded-xl rounded-r-none border-0
                                                        ${appliedFiltersRef.current[index] === undefined
                                ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                : "bg-white-500" // Active background
                              }`}
                          >
                            <CircleOff size={17} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFrequencySelection(index, 1)}
                            className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedFiltersRef.current[index] === 1
                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                : "bg-white-500" // Active background
                              }`}
                          >
                            50Hz
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFrequencySelection(index, 2)}
                            className={
                              `rounded-xl rounded-l-none border-0 ${appliedFiltersRef.current[index] === 2
                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white "
                                : "bg-white-500 animate-fade-in-right"
                              }`
                            }
                          >
                            60Hz
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );

}

export default Websocket;