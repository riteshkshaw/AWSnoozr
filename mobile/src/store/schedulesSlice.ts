import { createSlice } from '@reduxjs/toolkit';
const initialState = { schedules: [], loading: false };
const schedulesSlice = createSlice({ name: 'schedules', initialState, reducers: {} });
export default schedulesSlice.reducer;
