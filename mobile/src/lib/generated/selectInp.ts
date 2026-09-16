
/* eslint-disable */

  
    export type userInp = {
      
      tracks?: number | trackInp
sessions?: number | playbackSessionInp
annotations?: number | annotationInp
playlists?: number | playlistInp
    }


    export type userSchema = {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
createdAt?: Date;
updatedAt?: Date;
tracks: {
_id?: string;
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
totalPlayCount: number;
totalListenTimeSec: number;
lastPlayedAt?: number;
createdAt?: Date;
updatedAt?: Date;
}[];
sessions: {
_id?: string;
clientId?: string;
contentHash?: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
deviceInfo?: string;
createdAt?: Date;
updatedAt?: Date;
}[];
annotations: {
_id?: string;
clientId?: string;
positionSec: number;
text: string;
tags: string[];
color?: string;
timesPlayedBefore: number;
createdAt?: Date;
updatedAt?: Date;
}[];
playlists: {
_id?: string;
clientId?: string;
title: string;
description?: string;
isPublic: boolean;
items: {
trackId: string;
order: number;
}[];
createdAt?: Date;
updatedAt?: Date;
}[];
};
;


    export type trackInp = {
      user?: number | userInp
      sessions?: number | playbackSessionInp
annotations?: number | annotationInp
    }


    export type trackSchema = {
_id?: string;
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
totalPlayCount: number;
totalListenTimeSec: number;
lastPlayedAt?: number;
createdAt?: Date;
updatedAt?: Date;
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
};
sessions: {
_id?: string;
clientId?: string;
contentHash?: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
deviceInfo?: string;
createdAt?: Date;
updatedAt?: Date;
}[];
annotations: {
_id?: string;
clientId?: string;
positionSec: number;
text: string;
tags: string[];
color?: string;
timesPlayedBefore: number;
createdAt?: Date;
updatedAt?: Date;
}[];
};
;


    export type playbackSessionInp = {
      track?: number | trackInp
user?: number | userInp
      
    }


    export type playbackSessionSchema = {
_id?: string;
clientId?: string;
contentHash?: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
deviceInfo?: string;
createdAt?: Date;
updatedAt?: Date;
track: {
_id?: string;
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
totalPlayCount: number;
totalListenTimeSec: number;
lastPlayedAt?: number;
};
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
};
};
;


    export type annotationInp = {
      track?: number | trackInp
user?: number | userInp
session?: number | playbackSessionInp
      
    }


    export type annotationSchema = {
_id?: string;
clientId?: string;
positionSec: number;
text: string;
tags: string[];
color?: string;
timesPlayedBefore: number;
createdAt?: Date;
updatedAt?: Date;
track: {
_id?: string;
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
totalPlayCount: number;
totalListenTimeSec: number;
lastPlayedAt?: number;
};
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
};
session?: {
_id?: string;
clientId?: string;
contentHash?: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
};
};
;


    export type playlistInp = {
      user?: number | userInp
      
    }


    export type playlistSchema = {
_id?: string;
clientId?: string;
title: string;
description?: string;
isPublic: boolean;
items: {
trackId: string;
order: number;
}[];
createdAt?: Date;
updatedAt?: Date;
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
};
};
;


    export type ReqType = {

  
        main: {

      
        user: {

      
            register: {
set: {
username: string;
email: string;
password: string;
displayName?: string;
};
get: {
token: (0 | 1 );
user: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
            login: {
set: {
email: string;
password: string;
};
get?: {
token?: (0 | 1 );
user: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
            getMe: {
set: {
};
get: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
};
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
};
};
};

          
          }

        
        track: {

      
            registerTrack: {
set: {
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
};
get: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};

          
            getMyTracks: {
set: {
page?: number;
limit?: number;
skip?: number;
isAudiobook?: boolean;
search?: string;
sortBy?: ("createdAt" | "updatedAt" | "title" | "lastPlayedAt" );
sortOrder?: ("asc" | "desc" );
};
get: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
};
};
};
};

          
            getTrackDetail: {
set: {
trackId: string;
};
get: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
};
};
};
};

          
            syncLocalData: {
set: {
sessions?: {
clientId: string;
contentHash: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
deviceInfo?: string;
}[];
annotations?: {
clientId: string;
contentHash: string;
positionSec: number;
text: string;
tags: string[];
color?: string;
updatedAt?: number;
deleted: boolean;
}[];
playlists?: {
clientId: string;
title: string;
description?: string;
isPublic?: boolean;
items?: {
contentHash: string;
order: number;
}[];
updatedAt?: number;
deleted?: boolean;
}[];
};
get: {
syncedSessions?: number;
syncedAnnotations?: number;
syncedPlaylists?: number;
annotations?: {
clientId: string;
serverId?: string;
}[];
playlists?: {
clientId: string;
serverId?: string;
}[];
};
};

          
          }

        
        annotation: {

      
            updateAnnotation: {
set: {
annotationId: string;
text?: string;
tags?: string[];
color?: string;
updatedAt?: number;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
};
};
};

          
            deleteAnnotation: {
set: {
annotationId: string;
};
get: {
success: boolean;
};
};

          
            getMyAnnotations: {
set: {
page?: number;
limit?: number;
skip?: number;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
};
};
};

          
          }

        
        playbackSession: {

      
            getMyListeningHistory: {
set: {
page?: number;
limit?: number;
skip?: number;
from?: number;
to?: number;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
            getTrackSessions: {
set: {
page?: number;
limit?: number;
skip?: number;
trackId: string;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
            getMyStats: {
set: {
};
get: {
totalListenTimeSec: number;
sessionCount: number;
trackCount: number;
firstListenedAt?: number;
lastListenedAt?: number;
tracks: {
contentHash: string;
listenTimeSec: number;
playCount: number;
lastPlayedAt?: number;
}[];
};
};

          
          }

        
        playlist: {

      
            createPlaylist: {
set: {
title: string;
description?: string;
isPublic?: boolean;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
};
};

          
            updatePlaylist: {
set: {
playlistId: string;
title?: string;
description?: string;
isPublic?: boolean;
items?: {
trackId: string;
order: number;
}[];
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
};
};

          
            deletePlaylist: {
set: {
playlistId: string;
};
get: {
success: boolean;
};
};

          
            getMyPlaylists: {
set: {
page?: number;
limit?: number;
skip?: number;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
};
};
};

          
          }

        
        }

      
    };

  
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const lesanApi = (
	{ URL, settings, baseHeaders }: {
		URL: string;
		settings?: Record<string, any>;
		baseHeaders?: Record<string, any>;
	},
) => {
	const setting = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...baseHeaders,
		},
		...settings,
	};

	const setHeaders = (headers: Record<string, any>) => {
		setting.headers = {
			...setting.headers,
			...headers,
		};
	};

	const getSetting = () => setting;

	const send = async <
		TService extends keyof ReqType,
		TModel extends keyof ReqType[TService],
		TAct extends keyof ReqType[TService][TModel],
    // @ts-ignore: Unreachable code error
		TSet extends DeepPartial<ReqType[TService][TModel][TAct]["set"]>,
    // @ts-ignore: Unreachable code error
		TGet extends DeepPartial<ReqType[TService][TModel][TAct]["get"]>,
	>(body: {
		service?: TService;
		model: TModel;
		act: TAct;
		details: {
			set: TSet;
			get: TGet;
		};
	}, additionalHeaders?: Record<string, any>) => {
		const req = await fetch(URL, {
			...getSetting(),
			headers: {
				...getSetting().headers,
				...additionalHeaders,
		    connection: "keep-alive",
			},
			body: JSON.stringify(body),
		});

		return await req.json();
	};

	return { send, setHeaders };
};

  