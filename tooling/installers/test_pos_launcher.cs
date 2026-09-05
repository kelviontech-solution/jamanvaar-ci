using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("JAMANVAAR POS")]
[assembly: AssemblyDescription("JAMANVAAR POS Terminal")]
[assembly: AssemblyCompany("Kelviontech Systems")]
[assembly: AssemblyProduct("JAMANVAAR POS")]
[assembly: AssemblyCopyright("Copyright © 2026 Kelviontech Systems")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace Jamanvaar.Launcher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string serverScript = Path.Combine(baseDir, "server", "local_service.cjs");

                // 1. Ensure Local Server is running on port 5178
                EnsureServerRunning(serverScript);

                // 2. Launch Edge in App Mode
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                if (!File.Exists(edgePath))
                {
                    edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                }

                string url = "http://localhost:5178/pos";
                string args = "--app=\"" + url + "\" --window-size=1440,900 --no-first-run";

                ProcessStartInfo psi = new ProcessStartInfo(edgePath, args);
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error launching JAMANVAAR POS: " + ex.Message, "JAMANVAAR", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void EnsureServerRunning(string scriptPath)
        {
            if (IsPortListening(5178)) return;

            if (File.Exists(scriptPath))
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "node";
                psi.Arguments = "\"" + scriptPath + "\"";
                psi.WorkingDirectory = Path.GetDirectoryName(scriptPath);
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);

                // Wait up to 3 seconds for port to open
                for (int i = 0; i < 15; i++)
                {
                    Thread.Sleep(200);
                    if (IsPortListening(5178)) break;
                }
            }
        }

        private static bool IsPortListening(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(200);
                    if (success)
                    {
                        client.EndConnect(result);
                        return true;
                    }
                }
            }
            catch {}
            return false;
        }
    }
}
