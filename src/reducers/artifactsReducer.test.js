/*
Copyright 2019 Iguazio Systems Ltd.

Licensed under the Apache License, Version 2.0 (the "License") with
an addition restriction as set forth herein. You may not use this
file except in compliance with the License. You may obtain a copy of
the License at http://www.apache.org/licenses/LICENSE-2.0.

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
implied. See the License for the specific language governing
permissions and limitations under the License.

In addition, you may not use the software for any purposes that are
illegal under applicable law, and the grant of the foregoing license
under the Apache 2.0 license is conditioned upon your compliance with
such restriction.
*/
import { configureStore } from '@reduxjs/toolkit'

import artifactsReducer, { fetchArtifacts, fetchModels } from './artifactsReducer'
import artifactsApi from '../api/artifacts-api'
import { REQUEST_CANCELED } from '../constants'

vi.mock('../api/artifacts-api', () => ({
  default: {
    getArtifacts: vi.fn()
  }
}))

vi.mock('../utils/parseArtifacts', () => ({
  parseArtifacts: artifacts => artifacts
}))
vi.mock('../utils/filterArtifacts', () => ({
  filterArtifacts: artifacts => artifacts
}))
vi.mock('../utils/generateArtifacts', () => ({
  generateArtifacts: artifacts => artifacts
}))

const buildStore = () => configureStore({ reducer: { artifactsStore: artifactsReducer } })

const someArtifact = { db_key: 'a', tag: 'latest', project: 'p' }

describe('fetchArtifacts abort handling', () => {
  beforeEach(() => {
    artifactsApi.getArtifacts.mockReset()
  })

  it('rejects instead of fulfilling with empty data when the request is aborted', async () => {
    artifactsApi.getArtifacts.mockRejectedValueOnce(new Error(REQUEST_CANCELED))

    const store = buildStore()
    const action = await store.dispatch(fetchArtifacts({ project: 'p', filters: {}, config: {} }))

    expect(action.type).toBe(fetchArtifacts.rejected.type)
  })

  it('does not clear the current rows and resolves loading when a refresh is aborted', async () => {
    artifactsApi.getArtifacts.mockResolvedValueOnce({ data: { artifacts: [someArtifact] } })

    const store = buildStore()
    await store.dispatch(fetchArtifacts({ project: 'p', filters: {}, config: {} }))
    expect(store.getState().artifactsStore.artifacts).toEqual([someArtifact])

    artifactsApi.getArtifacts.mockRejectedValueOnce(new Error(REQUEST_CANCELED))
    await store.dispatch(fetchArtifacts({ project: 'p', filters: {}, config: {} }))

    const state = store.getState().artifactsStore
    expect(state.loading).toBe(false)
    expect(state.artifacts).toEqual([someArtifact])
    expect(state.error).toBeNull()
  })

  it('clears rows and sets an error, and still resolves loading, for a real failure', async () => {
    artifactsApi.getArtifacts.mockResolvedValueOnce({ data: { artifacts: [someArtifact] } })

    const store = buildStore()
    await store.dispatch(fetchArtifacts({ project: 'p', filters: {}, config: {} }))

    const realError = new Error('Network Error')
    artifactsApi.getArtifacts.mockRejectedValueOnce(realError)
    await store.dispatch(fetchArtifacts({ project: 'p', filters: {}, config: {} }))

    const state = store.getState().artifactsStore
    expect(state.loading).toBe(false)
    expect(state.artifacts).toEqual([])
    expect(state.error).toBeTruthy()
  })
})

describe('artifactsReducer fetchModels loading counter', () => {
  const arg = { project: 'p', filters: {}, config: {} }

  it('keeps models.loading true across an abort until the request that superseded it settles', () => {
    let state = artifactsReducer(undefined, { type: '@@INIT' })

    // Request A starts (e.g. the initial page load)
    state = artifactsReducer(state, fetchModels.pending('requestA', arg))
    expect(state.models.loading).toBe(true)

    // The user changes a filter before A settles: request B starts
    state = artifactsReducer(state, fetchModels.pending('requestB', arg))
    expect(state.models.loading).toBe(true)

    // A is aborted in favor of B
    state = artifactsReducer(state, fetchModels.rejected(new Error('canceled'), 'requestA', arg))
    expect(state.models.loading).toBe(true)

    // B fulfills with real data
    state = artifactsReducer(
      state,
      fetchModels.fulfilled({ artifacts: [someArtifact] }, 'requestB', arg)
    )
    expect(state.models.loading).toBe(false)
    expect(state.models.allData).toEqual([someArtifact])
  })
})
