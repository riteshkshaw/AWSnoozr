import React, { useState, useEffect } from 'react';
import './TagFilter.css';

const TagFilter = ({ onFilterChange, onClear }) => {
  const [tags, setTags] = useState({});
  const [selectedTags, setSelectedTags] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      setLoading(true);
      const api = (await import('../../services/api')).default;
      const data = await api.getAllTags();
      setTags(data.tags || {});
    } catch (error) {
      console.error('Error fetching tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTagToggle = (key, value) => {
    const newTags = { ...selectedTags };

    if (!newTags[key]) {
      newTags[key] = [];
    }

    if (newTags[key].includes(value)) {
      newTags[key] = newTags[key].filter(v => v !== value);
      if (newTags[key].length === 0) {
        delete newTags[key];
      }
    } else {
      newTags[key].push(value);
    }

    setSelectedTags(newTags);
    onFilterChange(newTags);
  };

  const handleClearAll = () => {
    setSelectedTags({});
    onClear();
  };

  const selectedCount = Object.values(selectedTags).reduce((sum, arr) => sum + arr.length, 0);

  if (loading) {
    return <div className="tag-filter-loading">Loading tags...</div>;
  }

  return (
    <div className="tag-filter">
      <div className="tag-filter-header">
        <button 
          className="tag-filter-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          🏷️ Filter by Tags
          {selectedCount > 0 && <span className="tag-count">{selected Count} selected</span>}
          <span className={`arrow ${expanded ? 'up' : 'down'}`}>▼</span>
        </button>
        {selectedCount > 0 && (
          <button className="clear-filters-btn" onClick={handleClearAll}>
            Clear All
          </button>
        )}
      </div>

      {expanded && (
        <div className="tag-filter-body">
          {Object.keys(tags).length === 0 ? (
            <div className="no-tags">
              <p>No tags found. Tags are automatically discovered from your resources.</p>
              <button className="btn btn-primary" onClick={fetchTags}>
                Refresh Tags
              </button>
            </div>
          ) : (
            <div className="tag-groups">
              {Object.entries(tags).map(([key, values]) => (
                <div key={key} className="tag-group">
                  <div className="tag-key">{key}</div>
                  <div className="tag-values">
                    {Object.entries(values).map(([value, info]) => (
                      <label key={value} className="tag-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedTags[key]?.includes(value) || false}
                          onChange={() => handleTagToggle(key, value)}
                        />
                        <span className="tag-value">
                          {value}
                          <span className="resource-count">({info.count})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="selected-tags">
          <strong>Active filters:</strong>
          {Object.entries(selectedTags).map(([key, values]) =>
            values.map(value => (
              <span key={`${key}:${value}`} className="selected-tag">
                {key}: {value}
                <button onClick={() => handleTagToggle(key, value)}>×</button>
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default TagFilter;
