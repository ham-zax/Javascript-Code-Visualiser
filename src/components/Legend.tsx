// src/components/Legend.tsx
    import React from 'react';

    export const Legend: React.FC = () => {
      return (
        <div className="bg-white p-3 rounded-md shadow text-xs text-gray-700">
          <h4 className="font-semibold mb-2 text-sm border-b pb-1">Legend</h4>
          <ul className="space-y-1">
            <li className="flex items-center">
              <span className="w-4 h-4 bg-yellow-700 bg-opacity-60 border border-yellow-400 mr-2 inline-block"></span>
              Code: Next line to execute
            </li>
            <li className="flex items-center">
              <span className="w-4 h-4 bg-green-100 border border-green-300 mr-2 inline-block"></span>
              Call Stack: Current function
            </li>
             <li className="flex items-center">
              <span className="w-4 h-4 bg-gray-100 border border-gray-300 mr-2 inline-block"></span>
              Call Stack: Previous function(s)
            </li>
            <li className="flex items-center">
              <span className="w-4 h-4 bg-blue-100 border border-blue-300 mr-2 inline-block"></span>
              Scope: Global or Local
            </li>
            <li className="flex items-center">
              <span className="w-4 h-4 bg-purple-100 border border-purple-300 mr-2 inline-block"></span>
              Scope: Captured via Closure
            </li>
          </ul>
        </div>
      );
    };
