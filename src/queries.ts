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
    playing
  }
}`;

export const PAUSE = `
mutation Pause($soundZone: ID!) {
  pause(input: { soundZone: $soundZone }) {
    playing
  }
}`;
