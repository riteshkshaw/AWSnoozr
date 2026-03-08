import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import resourcesReducer from './resourcesSlice';
import costsReducer from './costsSlice';
import schedulesReducer from './schedulesSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    resources: resourcesReducer,
    costs: costsReducer,
    schedules: schedulesReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
