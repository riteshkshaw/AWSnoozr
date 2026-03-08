import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ResourcesState {
  ec2: any[];
  rds: any[];
  redshift: any[];
  eks: any[];
  loading: boolean;
  lastUpdated: number | null;
}

const initialState: ResourcesState = {
  ec2: [],
  rds: [],
  redshift: [],
  eks: [],
  loading: false,
  lastUpdated: null,
};

const resourcesSlice = createSlice({
  name: 'resources',
  initialState,
  reducers: {
    setEC2: (state, action: PayloadAction<any[]>) => {
      state.ec2 = action.payload;
      state.lastUpdated = Date.now();
    },
    setRDS: (state, action: PayloadAction<any[]>) => {
      state.rds = action.payload;
      state.lastUpdated = Date.now();
    },
    setRedshift: (state, action: PayloadAction<any[]>) => {
      state.redshift = action.payload;
      state.lastUpdated = Date.now();
    },
    setEKS: (state, action: PayloadAction<any[]>) => {
      state.eks = action.payload;
      state.lastUpdated = Date.now();
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const { setEC2, setRDS, setRedshift, setEKS, setLoading } = resourcesSlice.actions;
export default resourcesSlice.reducer;
