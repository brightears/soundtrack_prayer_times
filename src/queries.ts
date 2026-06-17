// Queries for fetching account/location/zone data (for admin UI dropdowns)

export const ME_ACCOUNTS_PAGE = `
query ListAccounts($first: Int!, $after: String) {
  me {
    ... on PublicAPIClient {
      accounts(first: $first, after: $after) {
        edges {
          node {
            id
            businessName
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}`;

export const ACCOUNT_LOCATIONS = `
query AccountLocations($accountId: ID!) {
  account(id: $accountId) {
    id
    businessName
    locations(first: 100) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
}`;

export const LOCATION_SOUND_ZONES = `
query LocationSoundZones($accountId: ID!) {
  account(id: $accountId) {
    locations(first: 100) {
      edges {
        node {
          id
          name
          soundZones(first: 100) {
            edges {
              node {
                id
                name
                isPaired
              }
            }
          }
        }
      }
    }
  }
}`;

// Mutations for pause/play

export const PLAY = `
mutation Play($soundZone: ID!) {
  play(input: { soundZone: $soundZone }) {
    __typename
  }
}`;

export const PAUSE = `
mutation Pause($soundZone: ID!) {
  pause(input: { soundZone: $soundZone }) {
    __typename
  }
}`;

// Mutation for assigning a playlist/schedule to a sound zone.
// immediate:true makes the swap take over the live stream NOW; without it the API
// waits for the current track to finish (so the adhan would start late / not at all).
export const ASSIGN_SOURCE = `
mutation AssignSource($zoneId: ID!, $sourceId: ID!) {
  soundZoneAssignSource(input: { soundZones: [$zoneId], source: $sourceId, immediate: true }) {
    soundZones
  }
}`;

// Read a zone's currently-assigned source (Playlist | Schedule | Soundtrack) so we
// can restore EXACTLY that after an adhan prayer. Restoring a fixed playlist would
// break daypart automation on schedule-driven zones.
export const ZONE_PLAY_FROM = `
query ZonePlayFrom($zoneId: ID!) {
  soundZone(id: $zoneId) {
    playFrom {
      __typename
      ... on Playlist { id }
      ... on Schedule { id }
      ... on Soundtrack { id }
    }
  }
}`;

// Query for fetching an account's music library (playlists + schedules)
export const ACCOUNT_LIBRARY = `
query AccountLibrary($accountId: ID!) {
  account(id: $accountId) {
    musicLibrary {
      playlists(first: 200) {
        edges {
          node {
            id
            name
          }
        }
      }
      schedules(first: 200) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }
}`;
