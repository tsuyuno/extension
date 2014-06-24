'use strict';

var _ = require('underscore');
var $ = require('jquery');
var eliminatedPeers = [];
var chord;
var networkChecker;

var peerJsConfig = {
    host: 'scholar.ninja',
    port: 9000,
    debug: 1,
    config: {
        iceServers: [
            // Using public STUN for now.
            { url: 'stun:stun.l.google.com:19302'},
            { url: 'stun:stun01.sipphone.com' },
            { url: 'stun:stun.ekiga.net' },
            { url: 'stun:stun.fwdnet.net' },
            { url: 'stun:stun.ideasip.com' },
            { url: 'stun:stun.iptel.org' },
            { url: 'stun:stun.rixtelecom.se'},
            { url: 'stun:stun.schlund.de'},
            { url: 'stun:stun.l.google.com:19302'},
            { url: 'stun:stun1.l.google.com:19302'},
            { url: 'stun:stun2.l.google.com:19302'},
            { url: 'stun:stun3.l.google.com:19302'},
            { url: 'stun:stun4.l.google.com:19302'},
            { url: 'stun:stunserver.org'},
            { url: 'stun:stun.softjoys.com'},
            { url: 'stun:stun.voiparound.com'},
            { url: 'stun:stun.voipbuster.com'},
            { url: 'stun:stun.voipstunt.com'},
            { url: 'stun:stun.voxgratia.org'},
            { url: 'stun:stun.xten.com'},
            { url: 'turn:numb.viagenie.ca', credential: 'muazkh', username: 'webrtc@live.com'},
            { url: 'turn:192.158.29.39:3478?transport=udp', credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=', username: '28224511:1379330808'},
            { url: 'turn:192.158.29.39:3478?transport=tcp', credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=', username: '28224511:1379330808'}
        ]
    }
};

var config = {
    peer: { // The object to pass to the Peer constructor.
        options: peerJsConfig
    },
    numberOfEntriesInSuccessorList: 3,
    connectionPoolSize: 10,
    connectionOpenTimeout: 10000,
    requestTimeout: 30000,
    debug: false,
    stabilizeTaskInterval: 15000,
    fixFingerTaskInterval: 15000,
    checkPredecessorTaskInterval: 15000,
    networkCheckInterval: 15000
};

// Use the existing peer ID, if we have it.
chrome.storage.local.get('peer', function (obj) {

    if(obj.peer !== undefined) {
        config.peer.id = obj.peer.id;
    }
});

chord = new Chord(config);

var networkCheck = function () {
    if(!navigator.onLine) {
        // Still attempt to leave
        chord.leave();
        console.log('You are offline.');
    } else {
        if(!chord._localNode) {
            console.log('Rejoining the network.');
            createOrJoin();
        } else {
            // Saying hello to server
            chord._localNode.
                _nodeFactory._connectionFactory._peerAgent._peer.
                socket.send({type: 'HELLO'});

            console.log('HELLO');
        }
    }
};

var updatePeerId = function(peerId) {
    // Periodically check connection to PeerJS

    if(networkChecker) {
        clearInterval(networkChecker);
    }

    networkChecker = setInterval(networkCheck, config.networkCheckInterval);

    chord._localNode._nodeFactory._connectionFactory._peerAgent._peer.on('error', function(error) {
        console.log(error);
        chord.leave();
        if(networkChecker) {
            clearInterval(networkChecker);
        }
        createOrJoin();
    });

    console.log('My peer ID: ' + peerId);
    chrome.storage.local.set({peer: {id: peerId}});
    // Restore the DHT entries, if we have them.
    chrome.storage.local.get('entries', function (obj) {
        if(obj.entries !== undefined) {
            chord.setEntries(obj.entries);
        }
    });
};

var errorHandler = function(error) {
    if (error) {
        console.log('Failed: ' + error);
    }
};

var createOrJoin = function() {
    var peers = [];
    $.get(
        'http://' + peerJsConfig.host + ':9001/',
        function(data) {
            // Array of peers on DHT network
            data.map(function(p) {
                // Don't connect to our PeerId, or any eliminated peers
                var myPeerId;
                if(chord._localNode) {
                    myPeerId = chord.getPeerId;
                }

                if (p !== myPeerId && eliminatedPeers.indexOf(p) === -1) {
                    console.log('Peer', p);
                    peers.push(p);
                }
            });

            // First peer
            if (peers[0]) {
                // Join an existing chord network
                console.log('Joining', peers[0]);
                chord.join(peers[0], join);
            } else if (eliminatedPeers.length !== 0) {
                console.log('Fatal: Unable to join any of the existing peers. Failing.');
            } else {
                // Create a new chord network
                console.log('Creating new network');
                chord.create(create);
            }

        }
    );
};

var create = function(myPeerId, error) {
    if (error) {
        errorHandler(error);
    } else {
        updatePeerId(myPeerId);
    }
};

var join = function(myPeerId, error) {
    if (error) {
        errorHandler(error);

        // Hacky solution for ID is taken issue
        if(error.type === 'unavailable-id') {
            // Usually the taken ID will be a stale node (us from the past)
            eliminatedPeers.push(config.peer.id);
            delete config.peer.id;
        }

        // Retry with another peer after 1 second
        var currentPeer = error.message.substr(22,16);
        eliminatedPeers.push(currentPeer, myPeerId);
        setTimeout(createOrJoin, 1000);
    } else {
        updatePeerId(myPeerId);
    }
};

window.onunload = window.onbeforeunload = function() {
    chord.leave();
};

chord.onentriesinserted = _.debounce(function() {
    console.log('Storing entries locally.');
    chrome.storage.local.set({entries: chord.getEntries()});
}, 10000);

module.exports = chord;
module.exports.get = chord.retrieve;
module.exports.put = chord.insert;
module.exports.remove = chord.remove;
module.exports.createOrJoin = createOrJoin;