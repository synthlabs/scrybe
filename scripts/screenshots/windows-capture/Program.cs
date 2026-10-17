using System.Runtime.InteropServices;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.Foundation.Metadata;

internal static class Program
{
    [ComImport, Guid("3628e81b-3cac-4c60-b7f4-23ce0e0c3356"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ICaptureInterop
    {
        [PreserveSig] int CreateForWindow(nint window, ref Guid iid, out nint item);
        [PreserveSig] int CreateForMonitor(nint monitor, ref Guid iid, out nint item);
    }

    [DllImport("combase.dll", CharSet = CharSet.Unicode)]
    private static extern int WindowsCreateString(string value, int length, out nint result);
    [DllImport("combase.dll")] private static extern int WindowsDeleteString(nint value);
    [DllImport("combase.dll")] private static extern int RoGetActivationFactory(nint name, ref Guid iid, out nint result);
    [DllImport("combase.dll")] private static extern int RoInitialize(uint type);
    [DllImport("combase.dll")] private static extern void RoUninitialize();
    [DllImport("d3d11.dll")]
    private static extern int D3D11CreateDevice(nint adapter, int type, nint software, uint flags, nint levels, uint count, uint version, out nint device, out int level, out nint context);
    [DllImport("d3d11.dll")] private static extern int CreateDirect3D11DeviceFromDXGIDevice(nint device, out nint result);

    private static GraphicsCaptureItem Item(nint window)
    {
        const string name = "Windows.Graphics.Capture.GraphicsCaptureItem";
        Marshal.ThrowExceptionForHR(WindowsCreateString(name, name.Length, out var hstring));
        nint factory = 0, item = 0;
        try
        {
            var interopId = typeof(ICaptureInterop).GUID;
            Marshal.ThrowExceptionForHR(RoGetActivationFactory(hstring, ref interopId, out factory));
            var interop = (ICaptureInterop)Marshal.GetObjectForIUnknown(factory);
            var itemId = new Guid("79c3f95b-31f7-4ec2-a464-632ef5d30760");
            Marshal.ThrowExceptionForHR(interop.CreateForWindow(window, ref itemId, out item));
            return WinRT.MarshalInterface<GraphicsCaptureItem>.FromAbi(item);
        }
        finally
        {
            if (item != 0) Marshal.Release(item);
            if (factory != 0) Marshal.Release(factory);
            WindowsDeleteString(hstring);
        }
    }

    private static IDirect3DDevice Device()
    {
        nint device = 0, context = 0, dxgi = 0, inspectable = 0;
        try
        {
            // BGRA support is required by the capture frame pool.
            Marshal.ThrowExceptionForHR(D3D11CreateDevice(0, 1, 0, 0x20, 0, 0, 7, out device, out _, out context));
            var iid = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
            Marshal.ThrowExceptionForHR(Marshal.QueryInterface(device, ref iid, out dxgi));
            Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out inspectable));
            return WinRT.MarshalInterface<IDirect3DDevice>.FromAbi(inspectable);
        }
        finally
        {
            foreach (var pointer in new[] { inspectable, dxgi, context, device }) if (pointer != 0) Marshal.Release(pointer);
        }
    }

    private static int Main(string[] args)
    {
        var initialized = false;
        try
        {
            Marshal.ThrowExceptionForHR(RoInitialize(1));
            initialized = true;
            Capture(args).GetAwaiter().GetResult();
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Native capture failed: {error.Message}");
            return 1;
        }
        finally
        {
            if (initialized) RoUninitialize();
        }
    }

    private static async Task Capture(string[] args)
    {
            if (!GraphicsCaptureSession.IsSupported()) throw new InvalidOperationException("Windows.Graphics.Capture is unavailable");
            var item = Item(new nint(long.Parse(args[0])));
            using var device = Device();
            using var pool = Direct3D11CaptureFramePool.CreateFreeThreaded(device, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, item.Size);
            using var session = pool.CreateCaptureSession(item);
            if (ApiInformation.IsPropertyPresent("Windows.Graphics.Capture.GraphicsCaptureSession", "IsCursorCaptureEnabled"))
                session.IsCursorCaptureEnabled = false;
            var source = new TaskCompletionSource<Direct3D11CaptureFrame>(TaskCreationOptions.RunContinuationsAsynchronously);
            pool.FrameArrived += (sender, _) =>
            {
                try
                {
                    var nextFrame = sender.TryGetNextFrame();
                    if (nextFrame != null && !source.TrySetResult(nextFrame)) nextFrame.Dispose();
                }
                catch (Exception error) { source.TrySetException(error); }
            };
            session.StartCapture();
            using var frame = await source.Task.WaitAsync(TimeSpan.FromSeconds(20));
            using var bitmap = await SoftwareBitmap.CreateCopyFromSurfaceAsync(frame.Surface);
            var file = await StorageFile.GetFileFromPathAsync(Path.GetFullPath(args[1]));
            using IRandomAccessStream stream = await file.OpenAsync(FileAccessMode.ReadWrite);
            stream.Size = 0;
            var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream);
            encoder.SetSoftwareBitmap(bitmap);
            encoder.BitmapTransform.Bounds = new BitmapBounds { X = 0, Y = 0, Width = (uint)frame.ContentSize.Width, Height = (uint)frame.ContentSize.Height };
            await encoder.FlushAsync();
    }
}
