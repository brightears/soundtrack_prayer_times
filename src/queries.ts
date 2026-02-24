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

// Mutation for assigning a playlist/schedule to a sound zone
export const ASSIGN_SOURCE = `
mutation AssignSource($zoneId: ID!, $sourceId: ID!) {
  soundZoneAssignSource(input: { soundZones: [$zoneId], source: $sourceId }) {
    soundZones
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
