// Local executable alias for Seanime's ChromeDP browser discovery.
// It forwards Chromium arguments to Edge and isolates the browser lifetime.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;

internal static class EdgeBridge {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")]
    private static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr info, uint size);
    [DllImport("kernel32.dll")]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters {
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }

    // Windows CommandLineToArgvW-compatible quoting; preserve spaces and slashes.
    internal static string Quote(string value) {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') {
                result.Append('\\', slashes * 2 + 1);
                result.Append('"');
            } else {
                result.Append('\\', slashes);
                result.Append(c);
            }
            slashes = 0;
        }
        result.Append('\\', slashes * 2);
        return result.Append('"').ToString();
    }

    private static void Forward(StreamReader source, TextWriter destination) {
        char[] buffer = new char[4096];
        bool writable = true;
        int count;
        while ((count = source.Read(buffer, 0, buffer.Length)) > 0) {
            if (!writable) continue;
            try { destination.Write(buffer, 0, count); destination.Flush(); }
            catch (IOException) { writable = false; }
        }
    }

    private static int Main(string[] args) {
        string edge = Environment.GetEnvironmentVariable("MKISSA_EDGE_EXECUTABLE");
        if (String.IsNullOrEmpty(edge) || !File.Exists(edge)) {
            Console.Error.WriteLine("MKissa Edge bridge: start Seanime using Start-Seanime-With-Edge.ps1.");
            return 2;
        }
        IntPtr job = IntPtr.Zero;
        Process child = null;
        try {
            job = CreateJobObject(IntPtr.Zero, null);
            var limits = new ExtendedLimits();
            limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            int size = Marshal.SizeOf(limits);
            IntPtr memory = Marshal.AllocHGlobal(size);
            bool configured;
            try {
                Marshal.StructureToPtr(limits, memory, false);
                configured = job != IntPtr.Zero && SetInformationJobObject(job, 9, memory, (uint)size);
            } finally { Marshal.FreeHGlobal(memory); }
            if (!configured) throw new InvalidOperationException("Unable to create an isolated browser job.");
            string arguments = String.Join(" ", Array.ConvertAll(args, Quote));
            child = Process.Start(new ProcessStartInfo(edge, arguments) {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true
            });
            if (!AssignProcessToJobObject(job, child.Handle)) {
                child.Kill();
                throw new InvalidOperationException("Unable to attach the browser to its cleanup job.");
            }
            var output = Task.Factory.StartNew(() => Forward(child.StandardOutput, Console.Out));
            var error = Task.Factory.StartNew(() => Forward(child.StandardError, Console.Error));
            child.WaitForExit();
            int exitCode = child.ExitCode;
            // Closing the job also terminates any remaining child browser processes.
            CloseHandle(job); job = IntPtr.Zero;
            Task.WaitAll(output, error);
            return exitCode;
        } catch (Exception e) {
            Console.Error.WriteLine("MKissa Edge bridge: " + e.Message);
            return 1;
        } finally {
            if (job != IntPtr.Zero) CloseHandle(job);
            if (child != null) child.Dispose();
        }
    }
}
