import React, { useState, useMemo, useEffect, useRef } from 'react';
import ToastRegion from '../components/ToastRegion';
import { bunnyFoldersDemo, bunnyVideosDemo } from '../data/adminRemainingDemo';
import Icon from '../components/Icon';

export default function BunnyAdminPage() {
  const [folders, setFolders] = useState(bunnyFoldersDemo);
  const [videos, setVideos] = useState(bunnyVideosDemo);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showOrderMenu, setShowOrderMenu] = useState(false);
  
  // Pagination folders
  const [currentFolderPage, setCurrentFolderPage] = useState(1);
  const folderPageSize = 5;
  
  // Pagination videos
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Modals state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [renameFolderModalOpen, setRenameFolderModalOpen] = useState(false);
  
  const [currentVideo, setCurrentVideo] = useState(null);
  const [videoToDelete, setVideoToDelete] = useState(null);
  const [renameData, setRenameData] = useState({ newName: '' });
  const [newFolderData, setNewFolderData] = useState({ name: '', description: '' });
  const [renameFolderData, setRenameFolderData] = useState({ newName: '' });
  const [currentFolderToRename, setCurrentFolderToRename] = useState(null);
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [hoveredFolderId, setHoveredFolderId] = useState(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }

  const getFolderName = (id) => folders.find((f) => f.id === id)?.name || 'Unknown';

  const filteredFolders = useMemo(() => {
    return folders.filter((f) => !folderSearchQuery || f.name.toLowerCase().includes(folderSearchQuery.toLowerCase()));
  }, [folders, folderSearchQuery]);

  const folderTotalPages = Math.ceil(filteredFolders.length / folderPageSize) || 1;
  const paginatedFolders = useMemo(() => {
    return filteredFolders.slice((currentFolderPage - 1) * folderPageSize, currentFolderPage * folderPageSize);
  }, [filteredFolders, currentFolderPage]);

  const filteredVideos = useMemo(() => {
    let result = videos.filter((v) => {
      if (selectedFolder !== null && v.folderId !== selectedFolder) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const fName = getFolderName(v.folderId).toLowerCase();
        return v.title.toLowerCase().includes(q) || fName.includes(q);
      }
      return true;
    });

    result.sort((a, b) => {
      let valA, valB;
      if (sortBy === 'name') { valA = a.title; valB = b.title; }
      else if (sortBy === 'duration') { valA = a.duration || 0; valB = b.duration || 0; }
      else if (sortBy === 'size') { valA = a.size || 0; valB = b.size || 0; }
      else { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); }
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [videos, selectedFolder, searchQuery, sortBy, sortOrder, folders]);

  const totalPages = Math.ceil(filteredVideos.length / pageSize) || 1;
  const paginatedVideos = useMemo(() => {
    return filteredVideos.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredVideos, currentPage]);

  const getPagesArray = () => {
    const arr = [];
    for (let i = 1; i <= totalPages; i++) arr.push(i);
    return arr;
  };

  const getPageRange = () => {
    if (filteredVideos.length === 0) return '0';
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, filteredVideos.length);
    return `${start}-${end}`;
  };

  const getTotalDuration = () => {
    const totalSeconds = videos.reduce((acc, v) => acc + (v.duration || 0), 0);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="ba-bunny-admin-wrapper data-table-page" onClick={() => { setShowSortMenu(false); setShowOrderMenu(false); }}>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-film" /></span>
          <div>
            <h2>Bunny Admin</h2>
            <p>Manage video libraries and storage zones, monitor usage, and organize uploaded media assets.</p>
          </div>
        </div>
        <button className="ba-btn"
           style={{ background: '#ffb706', color: '#006073', border: 'none', fontWeight: 600, padding: '10px 20px', borderRadius: '6px', fontSize: '14px', transition: 'all 0.2s', whiteSpace: 'nowrap', cursor: 'pointer' }}
           onMouseOver={e => { e.currentTarget.style.background = '#ffa500'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(255, 183, 6, 0.3)'; }}
           onMouseOut={e => { e.currentTarget.style.background = '#ffb706'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
           onClick={() => setUploadModalOpen(true)}>
           <Icon className="ti ti-upload" /> Upload Videos
        </button>
      </div>

      <div className="ba-stats-grid">
        <div className="ba-stat-card">
          <div className="ba-stat-icon ba-purple"><Icon className="ti ti-video-camera" /></div>
          <div className="ba-stat-info">
            <h3>{videos.length}</h3>
            <p>Total Videos</p>
          </div>
        </div>
        <div className="ba-stat-card">
          <div className="ba-stat-icon ba-green"><Icon className="ti ti-folder" /></div>
          <div className="ba-stat-info">
            <h3>{folders.length}</h3>
            <p>Folders</p>
          </div>
        </div>
        <div className="ba-stat-card">
          <div className="ba-stat-icon ba-blue"><Icon className="ti ti-cloud" /></div>
          <div className="ba-stat-info">
            <h3>2.4 GB</h3>
            <p>Storage Used</p>
          </div>
        </div>
        <div className="ba-stat-card">
          <div className="ba-stat-icon ba-orange"><Icon className="ti ti-time" /></div>
          <div className="ba-stat-info">
            <h3>{getTotalDuration()}</h3>
            <p>Total Duration</p>
          </div>
        </div>
      </div>

      <div className="ba-filter-bar" style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <div className="ba-search-wrapper" style={{ flex: 1, position: 'relative' }}>
          {searchQuery ? (
            <button type="button" aria-label="Clear search" onClick={() => { setSearchQuery(''); setCurrentPage(1); }} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
              <Icon className="ti ti-close" />
            </button>
          ) : (
            <Icon className="ti ti-search" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          )}
          <input type="text" className="ba-search-input" placeholder="Search videos by name, folder, or tags..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} />
        </div>
        
        <div className="ba-filter-dropdown" style={{ position: 'relative' }}>
          <button className="ba-filter-select" onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); setShowOrderMenu(false); }}>
            Sort by {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)} <Icon className="ti ti-angle-down" />
          </button>
          {showSortMenu && (
            <ul className="ba-dropdown-menu" style={{ display: 'block', position: 'absolute', right: 0, top: '100%', minWidth: '160px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', zIndex: 100, padding: '5px 0', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              {['name', 'date', 'duration', 'size'].map(s => (
                <li key={s}><a href="#!" onClick={(e) => { e.preventDefault(); setSortBy(s); setShowSortMenu(false); }} style={{ display: 'block', padding: '8px 20px', color: '#374151', textDecoration: 'none' }}>Sort by {s.charAt(0).toUpperCase() + s.slice(1)}</a></li>
              ))}
            </ul>
          )}
        </div>

        <div className="ba-filter-dropdown" style={{ position: 'relative' }}>
          <button className="ba-filter-select" onClick={(e) => { e.stopPropagation(); setShowOrderMenu(!showOrderMenu); setShowSortMenu(false); }}>
            {sortOrder === 'asc' ? 'Ascending' : 'Descending'} <Icon className="ti ti-angle-down" />
          </button>
          {showOrderMenu && (
            <ul className="ba-dropdown-menu" style={{ display: 'block', position: 'absolute', right: 0, top: '100%', minWidth: '160px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', zIndex: 100, padding: '5px 0', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              <li><a href="#!" onClick={(e) => { e.preventDefault(); setSortOrder('asc'); setShowOrderMenu(false); }} style={{ display: 'block', padding: '8px 20px', color: '#374151', textDecoration: 'none' }}>Ascending</a></li>
              <li><a href="#!" onClick={(e) => { e.preventDefault(); setSortOrder('desc'); setShowOrderMenu(false); }} style={{ display: 'block', padding: '8px 20px', color: '#374151', textDecoration: 'none' }}>Descending</a></li>
            </ul>
          )}
        </div>
      </div>

      <div className="ba-video-management-container">
        <div className="ba-folder-sidebar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Video Folders</h3>
            <button className="ba-btn ba-btn-sm" style={{ background: '#006073', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px' }} onClick={() => setCreateFolderModalOpen(true)} title="Create New Folder">
               <Icon className="ti ti-plus" />
            </button>
          </div>

          <div className="ba-search-wrapper" style={{ position: 'relative', marginBottom: '15px' }}>
            {folderSearchQuery ? (
              <button type="button" aria-label="Clear search" onClick={() => { setFolderSearchQuery(''); setCurrentFolderPage(1); }} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px', color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
                <Icon className="ti ti-close" />
              </button>
            ) : (
              <Icon className="ti ti-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#9ca3af' }} />
            )}
            <input type="text" className="ba-search-input" placeholder="Search folders..." value={folderSearchQuery} onChange={(e) => { setFolderSearchQuery(e.target.value); setCurrentFolderPage(1); }} style={{ padding: '8px 10px 8px 30px', fontSize: '13px', height: '36px' }} />
          </div>

          <ul className="ba-folder-list">
             <li className={`ba-folder-item ${selectedFolder === null ? 'ba-active' : ''}`} onClick={() => { setSelectedFolder(null); setCurrentPage(1); }}>
                <Icon className="ti ti-layout-grid2" />
                <span className="ba-folder-name">All Videos</span>
                <span className="ba-folder-count">{videos.length}</span>
             </li>
             {paginatedFolders.map(folder => (
               <li key={folder.id} className={`ba-folder-item ${selectedFolder === folder.id ? 'ba-active' : ''}`} onClick={() => { setSelectedFolder(folder.id); setCurrentPage(1); }}>
                  <button type="button" className="ba-folder-icon-btn" title="Rename folder"
                     onMouseEnter={() => setHoveredFolderId(folder.id)}
                     onMouseLeave={() => setHoveredFolderId(null)}
                     onClick={e => { e.stopPropagation(); setCurrentFolderToRename(folder); setRenameFolderData({ newName: folder.name }); setRenameFolderModalOpen(true); }}
                     style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center' }}>
                     <Icon className={`ti ${hoveredFolderId === folder.id ? 'ti-pencil' : 'ti-folder'}`} />
                  </button>
                  <span className="ba-folder-name">{folder.name}</span>
                  <span className="ba-folder-count">{videos.filter(v => v.folderId === folder.id).length}</span>
               </li>
             ))}
          </ul>

          {filteredFolders.length > folderPageSize && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
               <button onClick={() => setCurrentFolderPage(p => Math.max(1, p - 1))} disabled={currentFolderPage === 1} style={{ padding: '4px 8px', background: 'none', border: '1px solid #ddd', borderRadius: '4px', cursor: currentFolderPage === 1 ? 'not-allowed' : 'pointer' }}><Icon className="ti ti-angle-left" /></button>
               <span style={{ fontSize: '12px', color: '#666', padding: '0 10px' }}>{currentFolderPage} / {folderTotalPages}</span>
               <button onClick={() => setCurrentFolderPage(p => Math.min(folderTotalPages, p + 1))} disabled={currentFolderPage >= folderTotalPages} style={{ padding: '4px 8px', background: 'none', border: '1px solid #ddd', borderRadius: '4px', cursor: currentFolderPage >= folderTotalPages ? 'not-allowed' : 'pointer' }}><Icon className="ti ti-angle-right" /></button>
            </div>
          )}
        </div>

        <div className="ba-video-main-content">
          <div className="ba-video-grid">
             {isLoading ? (
               Array.from({ length: 8 }).map((_, i) => (
                 <div key={i} className="ba-skeleton-card">
                    <div className="ba-skeleton-thumbnail"><div className="ba-skeleton-shimmer"></div></div>
                    <div className="ba-skeleton-info">
                       <div className="ba-skeleton-line ba-medium"><div className="ba-skeleton-shimmer"></div></div>
                       <div className="ba-skeleton-line ba-short"><div className="ba-skeleton-shimmer"></div></div>
                    </div>
                 </div>
               ))
             ) : (
                paginatedVideos.map(video => (
                  <div key={video.id} className="ba-video-card" onClick={() => { setCurrentVideo(video); setPlayerModalOpen(true); }}>
                     <div className="ba-video-thumbnail">
                        <Icon className="ti ti-video-camera" />
                        <div className="ba-play-overlay">
                           <div className="ba-play-icon"><Icon className="ti ti-control-play" /></div>
                        </div>
                        <span className="ba-video-duration">{formatDuration(video.duration)}</span>
                     </div>
                     <div className="ba-video-info">
                        <div className="ba-video-title" title={video.title}>{video.title}</div>
                        <div className="ba-video-meta">
                           <span><Icon className="ti ti-folder" /> {getFolderName(video.folderId)}</span>
                           <span><Icon className="ti ti-calendar" /> {new Date(video.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <div className="ba-video-actions" onClick={e => e.stopPropagation()}>
                           <button onClick={() => { setCurrentVideo(video); setRenameData({ newName: video.title }); setRenameModalOpen(true); }}>
                              <Icon className="ti ti-pencil" /> Rename
                           </button>
                           <button className="ba-danger" onClick={() => { setVideoToDelete(video); setDeleteModalOpen(true); }}>
                              <Icon className="ti ti-trash" /> Delete
                           </button>
                        </div>
                     </div>
                  </div>
                ))
             )}
          </div>

          {!isLoading && filteredVideos.length > 0 && (
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', padding: '15px', border: '1px solid #dee2e6', borderRadius: '6px', background: 'white' }}>
                 <div style={{ color: '#6b7280', fontSize: '14px' }}>Showing {getPageRange()} of {filteredVideos.length} videos</div>
                 <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: '6px 12px', border: '1px solid #ddd', background: 'white', borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}><Icon className="ti ti-angle-left" /> Previous</button>
                    {getPagesArray().map(p => (
                       <button key={p} onClick={() => setCurrentPage(p)} style={{ padding: '6px 12px', border: '1px solid #ddd', background: p === currentPage ? '#006073' : 'white', color: p === currentPage ? 'white' : 'black', borderRadius: '4px', cursor: 'pointer' }}>{p}</button>
                    ))}
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} style={{ padding: '6px 12px', border: '1px solid #ddd', background: 'white', borderRadius: '4px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}>Next <Icon className="ti ti-angle-right" /></button>
                 </div>
             </div>
          )}

          {!isLoading && filteredVideos.length === 0 && (
             <div className="ba-empty-state">
                <Icon className="ti ti-package" />
                <h3>No Videos Found</h3>
                <p>{searchQuery ? "Try adjusting your search criteria" : "Upload your first video to get started"}</p>
             </div>
          )}
        </div>
      </div>

      {/* Rename Modal */}
      {renameModalOpen && (
         <div className="crispr-modal-backdrop active" onClick={() => setRenameModalOpen(false)}>
            <div className="crispr-modal-dialog" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
               <div className="crispr-modal-header">
                  <h3><Icon className="ti ti-pencil" /> Rename Video</h3>
                  <button type="button" className="crispr-modal-close" onClick={() => setRenameModalOpen(false)}><Icon className="ti ti-close" /></button>
               </div>
               <form onSubmit={e => {
                   e.preventDefault();
                   if (!renameData.newName.trim()) return;
                   setVideos(videos.map(v => v.id === currentVideo.id ? { ...v, title: renameData.newName } : v));
                   setRenameModalOpen(false);
                   showToast('success', 'Renamed', `Video renamed to ${renameData.newName}`);
               }}>
                  <div className="crispr-modal-body">
                     <div className="form-group">
                        <label>Video Name <span className="required">*</span></label>
                        <input type="text" className="form-control" required autoFocus value={renameData.newName} onChange={e => setRenameData({ newName: e.target.value })} placeholder="Enter new name" />
                     </div>
                  </div>
                  <div className="crispr-modal-footer">
                     <button type="button" className="btn-modal-cancel" onClick={() => setRenameModalOpen(false)}>Cancel</button>
                     <button type="submit" className="btn-modal-primary" disabled={!renameData.newName.trim()}>
                        <Icon className="ti ti-check" /> Rename
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* Delete Modal */}
      {deleteModalOpen && (
         <div className="ba-modal-backdrop ba-active" onClick={() => setDeleteModalOpen(false)}>
            <div className="ba-modal-dialog" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
               <div className="ba-modal-header" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' }}>
                  <h3 style={{ color: 'white' }}><Icon className="ti ti-alert" /> Confirm Delete</h3>
                  <button type="button" className="crispr-modal-close" onClick={() => setDeleteModalOpen(false)}><Icon className="ti ti-close" /></button>
               </div>
               <div className="ba-modal-body">
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                     <Icon className="ti ti-alert" style={{ fontSize: '48px', color: '#ef4444', marginBottom: '20px', display: 'block' }} />
                     <p style={{ fontSize: '16px', color: '#1f2937', marginBottom: '10px' }}>Are you sure you want to delete <strong>{videoToDelete?.title}</strong>?</p>
                     <p style={{ color: '#6b7280', fontSize: '14px' }}>This action cannot be undone and will permanently remove this video.</p>
                  </div>
               </div>
               <div className="ba-modal-footer">
                  <button onClick={() => setDeleteModalOpen(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={() => { 
                      setVideos(videos.filter(v => v.id !== videoToDelete.id)); 
                      setDeleteModalOpen(false); 
                      showToast('success', 'Deleted', `Video ${videoToDelete.title} deleted.`); 
                  }} style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                     <Icon className="ti ti-trash" /> Delete Video
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* Create Folder Modal */}
      {createFolderModalOpen && (
         <div className="ba-modal-backdrop ba-active" onClick={() => setCreateFolderModalOpen(false)}>
            <div className="ba-modal-dialog" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
               <div className="ba-modal-header">
                  <h3><Icon className="ti ti-folder" /> Create New Folder</h3>
                  <button className="ba-modal-close" onClick={() => setCreateFolderModalOpen(false)}><Icon className="ti ti-close" /></button>
               </div>
               <div className="ba-modal-body">
                  <div className="ba-form-group">
                     <label>Folder Name <span style={{ color: '#ef4444' }}>*</span></label>
                     <input type="text" className="ba-form-input" value={newFolderData.name} onChange={e => setNewFolderData({ ...newFolderData, name: e.target.value })} placeholder="Enter folder name" />
                  </div>
                  <div className="ba-form-group">
                     <label>Description (Optional)</label>
                     <textarea className="ba-form-input" value={newFolderData.description} onChange={e => setNewFolderData({ ...newFolderData, description: e.target.value })} placeholder="Enter folder description" rows="3"></textarea>
                  </div>
               </div>
               <div className="ba-modal-footer">
                  <button onClick={() => setCreateFolderModalOpen(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                  <button disabled={!newFolderData.name} onClick={() => { 
                      const newFolder = { id: 'F-' + Date.now(), name: newFolderData.name, description: newFolderData.description, videoCount: 0 }; 
                      setFolders([...folders, newFolder]); 
                      setCreateFolderModalOpen(false); 
                      setNewFolderData({ name: '', description: '' }); 
                      showToast('success', 'Created', `Folder ${newFolderData.name} created.`); 
                  }} style={{ padding: '8px 16px', background: '#006073', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                     <Icon className="ti ti-check" /> Create Folder
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* Rename Folder Modal */}
      {renameFolderModalOpen && (
         <div className="crispr-modal-backdrop active" onClick={() => setRenameFolderModalOpen(false)}>
            <div className="crispr-modal-dialog" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
               <div className="crispr-modal-header">
                  <h3><Icon className="ti ti-pencil" /> Rename Folder</h3>
                  <button type="button" className="crispr-modal-close" onClick={() => setRenameFolderModalOpen(false)}><Icon className="ti ti-close" /></button>
               </div>
               <div className="crispr-modal-body">
                  <div className="form-group">
                     <label>Folder Name <span className="required">*</span></label>
                     <input type="text" className="form-input" value={renameFolderData.newName} onChange={e => setRenameFolderData({ newName: e.target.value })} placeholder="Enter new folder name" />
                  </div>
               </div>
               <div className="crispr-modal-footer">
                  <button type="button" className="btn-modal-cancel" onClick={() => setRenameFolderModalOpen(false)}>Cancel</button>
                  <button type="button" className="btn-modal-primary" disabled={!renameFolderData.newName} onClick={() => {
                      setFolders(folders.map(f => f.id === currentFolderToRename.id ? { ...f, name: renameFolderData.newName } : f));
                      setRenameFolderModalOpen(false);
                      showToast('success', 'Renamed', `Folder renamed to ${renameFolderData.newName}.`);
                  }}>
                     <Icon className="ti ti-check" /> Rename Folder
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* Video Player Modal */}
      {playerModalOpen && (
         <div className="ba-modal-backdrop ba-active" onClick={() => setPlayerModalOpen(false)}>
            <div className="ba-modal-dialog" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
               <div className="ba-modal-header">
                  <h3><Icon className="ti ti-control-play" /> {currentVideo?.title}</h3>
                  <button className="ba-modal-close" onClick={() => setPlayerModalOpen(false)}><Icon className="ti ti-close" /></button>
               </div>
               <div className="ba-modal-body">
                  <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: '#000' }}>
                     <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white' }}>
                        <Icon className="ti ti-video-camera" style={{ fontSize: '48px', opacity: 0.5 }} />
                        <p style={{ marginTop: '10px' }}>Video Player Standin</p>
                     </div>
                  </div>
                  <div style={{ marginTop: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                           <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Folder</span>
                           <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: 500 }}>{getFolderName(currentVideo?.folderId)}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                           <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Upload Date</span>
                           <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: 500 }}>{new Date(currentVideo?.date).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric' })}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                           <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Duration</span>
                           <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: 500 }}>{formatDuration(currentVideo?.duration)}</span>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Upload Modal */}
      {uploadModalOpen && (
         <div className="crispr-modal-backdrop active" onClick={() => setUploadModalOpen(false)}>
            <div className="crispr-modal-dialog" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
               <div className="crispr-modal-header">
                  <h3><Icon className="ti ti-upload" /> Upload Videos</h3>
                  <button type="button" className="crispr-modal-close" onClick={() => setUploadModalOpen(false)}><Icon className="ti ti-close" /></button>
               </div>
               <div className="crispr-modal-body">
                  <div className="form-group">
                     <label>Select Folder <span className="required">*</span></label>
                     <select className="form-input" value={uploadFolder} onChange={e => setUploadFolder(e.target.value)}>
                        <option value="">-- Select Folder --</option>
                        {folders.map(folder => (
                           <option key={folder.id} value={folder.id}>{folder.name}</option>
                        ))}
                     </select>
                  </div>
                  <div className="ba-upload-zone" style={{ border: '2px dashed #cbd5e0', borderRadius: '8px', padding: '30px', textAlign: 'center', background: '#f8fafc', cursor: 'pointer' }}
                     onClick={() => fileInputRef.current?.click()}
                     onDragOver={e => { e.preventDefault(); }}
                     onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.length) setUploadFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}>
                     <Icon className="ti ti-cloud-up" style={{ fontSize: '48px', color: '#94a3b8', marginBottom: '15px', display: 'block' }} />
                     <h4 style={{ margin: '0 0 5px 0', color: '#334155', fontSize: '16px', fontWeight: 600 }}>Drag & Drop Videos Here</h4>
                     <p style={{ margin: '0 0 15px 0', color: '#64748b', fontSize: '14px' }}>or click to browse files</p>
                     <button type="button" className="ba-btn" style={{ background: '#006073', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px' }}>
                        Browse Files
                     </button>
                     <input ref={fileInputRef} type="file" accept="video/*" multiple style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.length) setUploadFiles(prev => [...prev, ...Array.from(e.target.files)]); e.target.value = ''; }} />
                  </div>
                  {uploadFiles.length > 0 && (
                     <div className="form-group" style={{ marginTop: '15px' }}>
                        <label>Selected Files ({uploadFiles.length})</label>
                        {uploadFiles.map((file, idx) => (
                           <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '8px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#334155', overflow: 'hidden' }}>
                                 <Icon className="ti ti-video" style={{ color: '#006073' }} />
                                 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                              </span>
                              <button type="button" aria-label="Remove file" onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
                                 <Icon className="ti ti-close" />
                              </button>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
               <div className="crispr-modal-footer">
                  <button type="button" className="btn-modal-cancel" onClick={() => { setUploadModalOpen(false); setUploadFiles([]); }}>Cancel</button>
                  <button type="button" className="btn-modal-primary" disabled={!uploadFolder || uploadFiles.length === 0} onClick={() => {
                      setUploadModalOpen(false);
                      showToast('success', 'Upload Demo', `Upload started for ${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''}.`);
                      setUploadFiles([]);
                  }}>
                     <Icon className="ti ti-upload" /> Upload Files
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
