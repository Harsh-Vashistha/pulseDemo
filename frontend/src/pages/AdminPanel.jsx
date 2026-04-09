import React, { useState, useEffect } from 'react';
import { adminAPI } from '../api';

const roleColors = {
  admin: 'bg-purple-500/20 text-purple-400',
  editor: 'bg-blue-500/20 text-blue-400',
  viewer: 'bg-gray-500/20 text-gray-400',
};

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    Promise.all([adminAPI.getUsers(), adminAPI.getStats()])
      .then(([usersRes, statsRes]) => {
        setUsers(usersRes.data.data);
        setStats(statsRes.data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRoleChange = async (userId, role) => {
    setUpdating(userId);
    try {
      const res = await adminAPI.updateRole(userId, role);
      setUsers((prev) => prev.map((u) => (u._id === userId ? res.data.data : u)));
    } catch {
      alert('Failed to update role.');
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleStatus = async (user) => {
    setUpdating(user._id);
    try {
      const res = await adminAPI.updateStatus(user._id, !user.isActive);
      setUsers((prev) => prev.map((u) => (u._id === user._id ? res.data.data : u)));
    } catch {
      alert('Failed to update status.');
    } finally {
      setUpdating(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Admin Panel</h1>
      <p className="text-gray-400 text-sm mb-8">Manage users and view system statistics</p>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Users', value: stats.totalUsers, color: 'text-blue-400' },
            { label: 'Videos', value: stats.totalVideos, color: 'text-purple-400' },
            { label: 'Processing', value: stats.processingVideos, color: 'text-yellow-400' },
            { label: 'Safe', value: stats.safeVideos, color: 'text-green-400' },
            { label: 'Flagged', value: stats.flaggedVideos, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-gray-500 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Users table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between gap-4">
          <h2 className="text-white font-semibold">Users ({filtered.length})</h2>
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u._id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{u.username}</p>
                    <p className="text-gray-500 text-xs">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${roleColors[u.role]}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${u.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        disabled={updating === u._id}
                        onChange={(e) => handleRoleChange(u._id, e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        disabled={updating === u._id}
                        className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 ${
                          u.isActive
                            ? 'bg-red-600/20 hover:bg-red-600/40 text-red-400'
                            : 'bg-green-600/20 hover:bg-green-600/40 text-green-400'
                        }`}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
