import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Spinner } from '../../components/ui/Spinner'
import api from '../../lib/api'

export default function OrgSettingsPage() {
  const [threshold, setThreshold] = useState(95)

  const mutation = useMutation({
    mutationFn: () => api.patch(`/admin/settings/similarity-threshold?threshold=${threshold / 100}`),
    onSuccess: () => toast.success('Similarity threshold updated'),
    onError: () => toast.error('Failed to update'),
  })

  return (
    <div>
      <TopBar title="Platform Settings" subtitle="Organisation-level configuration" />
      <div className="p-6 max-w-lg space-y-5">
        <div className="card space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Plagiarism Detection</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Configure the similarity threshold for flagging submissions.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="label mb-0">Similarity Threshold</label>
              <span className="text-sm font-bold text-primary-700">{threshold}%</span>
            </div>
            <p className="text-xs text-gray-400">
              Submissions with ≥{threshold}% similarity are flagged for professor review.
            </p>
            <input type="range" min={50} max={99} value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className="w-full accent-primary-600" />
            <div className="flex justify-between text-xs text-gray-400">
              <span>50% (more flags)</span><span>99% (fewer flags)</span>
            </div>
          </div>
          <button className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="h-4 w-4" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
