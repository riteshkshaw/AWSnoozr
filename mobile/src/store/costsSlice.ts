import { createSlice } from '@reduxjs/toolkit';
const initialState = { summary: null, trend: [], loading: false };
const costsSlice = createSlice({ name: 'costs', initialState, reducers: {} });
export default costsSlice.reducer;
