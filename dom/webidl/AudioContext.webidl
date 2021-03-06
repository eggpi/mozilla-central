/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://dvcs.w3.org/hg/audio/raw-file/tip/webaudio/specification.html
 *
 * Copyright © 2012 W3C® (MIT, ERCIM, Keio), All Rights Reserved. W3C
 * liability, trademark and document use rules apply.
 */

callback DecodeSuccessCallback = void (AudioBuffer decodedData);
callback DecodeErrorCallback = void ();

[Constructor, PrefControlled]
interface AudioContext : EventTarget {

    readonly attribute AudioDestinationNode destination;
    readonly attribute float sampleRate;
    readonly attribute double currentTime;
    readonly attribute AudioListener listener;

    [NewObject, Throws]
    AudioBuffer createBuffer(unsigned long numberOfChannels, unsigned long length, float sampleRate);

    void decodeAudioData(ArrayBuffer audioData,
                         DecodeSuccessCallback successCallback,
                         optional DecodeErrorCallback errorCallback);

    // AudioNode creation 
    [NewObject]
    AudioBufferSourceNode createBufferSource();

    [NewObject, Throws]
    MediaStreamAudioDestinationNode createMediaStreamDestination();

    [NewObject, Throws]
    ScriptProcessorNode createScriptProcessor(optional unsigned long bufferSize = 0,
                                              optional unsigned long numberOfInputChannels = 2,
                                              optional unsigned long numberOfOutputChannels = 2);

    [NewObject]
    AnalyserNode createAnalyser();
    [NewObject, Throws]
    MediaElementAudioSourceNode createMediaElementSource(HTMLMediaElement mediaElement);
    [NewObject, Throws]
    MediaStreamAudioSourceNode createMediaStreamSource(MediaStream mediaStream);
    [NewObject]
    GainNode createGain();
    [NewObject, Throws]
    DelayNode createDelay(optional double maxDelayTime = 1);
    [NewObject]
    BiquadFilterNode createBiquadFilter();
    [NewObject]
    WaveShaperNode createWaveShaper();
    [NewObject]
    PannerNode createPanner();
    [NewObject]
    ConvolverNode createConvolver();

    [NewObject, Throws]
    ChannelSplitterNode createChannelSplitter(optional unsigned long numberOfOutputs = 6);
    [NewObject, Throws]
    ChannelMergerNode createChannelMerger(optional unsigned long numberOfInputs = 6);

    [NewObject]
    DynamicsCompressorNode createDynamicsCompressor();

    [NewObject]
    OscillatorNode createOscillator();
    [NewObject, Throws]
    PeriodicWave createPeriodicWave(Float32Array real, Float32Array imag);

};

/*
 * The origin of this IDL file is
 * https://dvcs.w3.org/hg/audio/raw-file/tip/webaudio/specification.html#AlternateNames
 */
[PrefControlled]
partial interface AudioContext {
    [NewObject, Throws]
    AudioBuffer? createBuffer(ArrayBuffer buffer, boolean mixToMono);

    // Same as createGain()
    [NewObject,Pref="media.webaudio.legacy.AudioContext"]
    GainNode createGainNode();

    // Same as createDelay()
    [NewObject, Throws, Pref="media.webaudio.legacy.AudioContext"]
    DelayNode createDelayNode(optional double maxDelayTime = 1);

    // Same as createScriptProcessor()
    [NewObject, Throws, Pref="media.webaudio.legacy.AudioContext"]
    ScriptProcessorNode createJavaScriptNode(optional unsigned long bufferSize = 0,
                                             optional unsigned long numberOfInputChannels = 2,
                                             optional unsigned long numberOfOutputChannels = 2);
};

enum AudioChannel {
  "normal",
  "content",
  "notification",
  "alarm",
  "telephony",
  "ringer",
  "publicnotification",
};

// Mozilla extensions
partial interface AudioContext {
  // Read HTMLMediaElement.webidl for more information about this attribute.
  [Pref="media.useAudioChannelService", SetterThrows]
  attribute AudioChannel mozAudioChannelType;
};
