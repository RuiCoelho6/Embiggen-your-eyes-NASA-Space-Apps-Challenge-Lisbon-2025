import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:xml/xml.dart';

void main() {
  runApp(const EmbBiggenApp());
}

class EmbBiggenApp extends StatelessWidget {
  const EmbBiggenApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'EmbBiggen Explorer',
      theme: ThemeData.dark(),
      home: const ImageExplorer(),
    );
  }
}

/// =========================
/// Modelo DZI + carregamento
/// =========================

class DziEntry {
  final String name;       // e.g. 'carina'
  final String dziPath;    // e.g. 'assets/dzi/carina.dzi'
  final String tilesRoot;  // e.g. 'assets/dzi/carina_files'
  final int width;
  final int height;
  final int tileSize;
  final String format;     // 'jpg' ou 'png'
  final int maxLevel;      // 0..maxLevel (zoom máximo)

  String get thumbTile0 => '$tilesRoot/0/0_0.$format';

  const DziEntry({
    required this.name,
    required this.dziPath,
    required this.tilesRoot,
    required this.width,
    required this.height,
    required this.tileSize,
    required this.format,
    required this.maxLevel,
  });
}

Future<List<DziEntry>> loadDziCatalog() async {
  final manifestStr = await rootBundle.loadString('AssetManifest.json');
  final Map<String, dynamic> manifest = jsonDecode(manifestStr);

  final dziPaths = manifest.keys
      .where((k) => k.startsWith('assets/dzi/') && k.endsWith('.dzi'))
      .toList()
    ..sort();

  final out = <DziEntry>[];
  for (final dziPath in dziPaths) {
    final name = dziPath.split('/').last.replaceAll('.dzi', '');
    final tilesRoot = 'assets/dzi/${name}_files';

    try {
      final xmlStr = await rootBundle.loadString(dziPath);
      final doc = XmlDocument.parse(xmlStr);
      final imageNode = doc.getElement('Image');
      final sizeNode = imageNode?.getElement('Size');
      if (imageNode == null || sizeNode == null) continue;

      final tileSize = int.tryParse(imageNode.getAttribute('TileSize') ?? '256') ?? 256;
      final format = (imageNode.getAttribute('Format') ?? 'jpg').toLowerCase();
      final width = int.parse(sizeNode.getAttribute('Width')!);
      final height = int.parse(sizeNode.getAttribute('Height')!);

      final maxDim = math.max(width, height).toDouble();
      final maxLevel = (math.log(maxDim) / math.log(2)).ceil();

      out.add(DziEntry(
        name: name,
        dziPath: dziPath,
        tilesRoot: tilesRoot,
        width: width,
        height: height,
        tileSize: tileSize,
        format: format,
        maxLevel: maxLevel,
      ));
    } catch (_) {
      // Ignora ficheiros inválidos
    }
  }
  return out;
}

/// =========================
/// App original + integração
/// =========================

class ImageData {
  final String url;
  final String name;
  final String description;

  ImageData({
    required this.url,
    required this.name,
    required this.description,
  });
}

class ImageExplorer extends StatefulWidget {
  const ImageExplorer({super.key});

  @override
  State<ImageExplorer> createState() => _ImageExplorerState();
}

class _ImageExplorerState extends State<ImageExplorer> {
  final TransformationController _controller = TransformationController();
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _topSearchController = TextEditingController();

  // Deep Zoom
  final MapController _dziMapController = MapController();
  List<DziEntry> _dziCatalog = [];
  DziEntry? _currentDzi;

  // Imagem normal atual
  ImageData? _currentImage;

  // Lista de imagens normais
  final List<ImageData> allImages = [
    ImageData(
      url: 'https://www.nasa.gov/wp-content/uploads/2025/09/nasa-october-2025-4k-3840x2160-1.jpg',
      name: 'Nebulosa Carina',
      description: 'Uma das maiores regiões de formação estelar',
    ),
    ImageData(
      url: 'https://www.nasa.gov/wp-content/uploads/2025/09/hubble-lmc-n44c-potw2536a.jpg',
      name: 'Galáxia Espiral',
      description: 'Magnífica galáxia espiral captada pelo Hubble',
    ),
    ImageData(
      url: 'https://www.nasa.gov/wp-content/uploads/2025/09/iss047e137096orig.jpg',
      name: 'Terra do Espaço',
      description: 'Vista deslumbrante da Terra desde a ISS',
    ),
    ImageData(
      url: 'https://www.nasa.gov/wp-content/uploads/2025/09/54735841713-aa9781d42e-o.jpg',
      name: 'Saturno Majestoso',
      description: 'O planeta dos anéis em toda sua glória',
    ),
    ImageData(
      url: 'https://www.nasa.gov/wp-content/uploads/2025/09/brief-outburst-16760026566-oorig.jpg',
      name: 'Explosão Estelar',
      description: 'Momento explosivo de uma estrela distante',
    ),
  ];

  // Favoritos
  List<ImageData> favoriteImages = [];

  List<ImageData> _filteredImages = [];
  List<ImageData> _searchSuggestions = [];
  bool _showSuggestions = false;

  // Seção ativa no painel
  String _currentSection = 'none'; // 'favorites' | 'images' | 'info' | 'dzi'

  @override
  void initState() {
    super.initState();
    _controller.value = Matrix4.identity();
    _filteredImages = List.from(allImages);
    favoriteImages = [allImages[4], allImages[1]];
    _currentImage = allImages[0];
    _searchController.addListener(_filterImages);
    _topSearchController.addListener(_updateTopSearchSuggestions);
    _initDzi();
  }

  Future<void> _initDzi() async {
    final list = await loadDziCatalog();
    if (!mounted) return;
    setState(() => _dziCatalog = list);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _topSearchController.dispose();
    _controller.dispose();
    super.dispose();
  }

  void _filterImages() {
    setState(() {
      if (_searchController.text.isEmpty) {
        _filteredImages = List.from(allImages);
      } else {
        _filteredImages = allImages
            .where((img) =>
                img.name.toLowerCase().contains(_searchController.text.toLowerCase()))
            .toList();
      }
    });
  }

  void _updateTopSearchSuggestions() {
    setState(() {
      if (_topSearchController.text.isEmpty) {
        _searchSuggestions = List.from(allImages);
        _showSuggestions = false;
      } else {
        _searchSuggestions = allImages
            .where((img) =>
                img.name.toLowerCase().contains(_topSearchController.text.toLowerCase()))
            .toList();
        _showSuggestions = _searchSuggestions.isNotEmpty;
      }
    });
  }

  void _changeMainImage(ImageData imageData) {
    setState(() {
      _currentDzi = null; // sair do modo DZI
      _currentImage = imageData;
      _controller.value = Matrix4.identity();
      _showSuggestions = false;
      _topSearchController.clear();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        setState(() => _controller.value = Matrix4.identity());
      }
    });
  }

  void _selectFromSuggestion(ImageData imageData) => _changeMainImage(imageData);

  // Abrir viewer DZI
  void _openDzi(DziEntry dzi) {
    setState(() {
      _currentDzi = dzi;
      _currentImage = null;
      _showSuggestions = false;
    });
  }

  // (Opcional) voltar ao modo imagem normal
  void _closeDzi() {
    setState(() {
      _currentDzi = null;
      _currentImage = allImages[0];
    });
  }

  /// Viewer Deep Zoom (flutter_map + CRS.simple)
  Widget buildDeepZoomView(BuildContext outerContext, {required DziEntry dzi}) {
    final bounds = LatLngBounds(
      const LatLng(0, 0),
      LatLng(dzi.height.toDouble(), dzi.width.toDouble()),
    );

    final pinPositions = <LatLng>[
      // Exemplo de pin em (y, x) pixels:
      LatLng(dzi.height * 0.3, dzi.width * 0.45),
    ];
    final pinTitles = <String>['Waypoint A'];

    return FlutterMap(
      mapController: _dziMapController,
      options: MapOptions(
        crs: const CrsSimple(),
        initialCenter: LatLng(dzi.height / 2, dzi.width / 2),
        initialZoom: dzi.maxLevel / 2,
        minZoom: 0,
        maxZoom: dzi.maxLevel.toDouble(),
        cameraConstraint: CameraConstraint.contain(bounds: bounds),
      ),
      children: [
        TileLayer(
          urlTemplate: '${dzi.tilesRoot}/{z}/{x}_{y}.${dzi.format}',
          tileProvider: AssetTileProvider(),
          tileSize: dzi.tileSize.toDouble(),
        ),
        MarkerLayer(
          markers: List.generate(pinPositions.length, (i) {
            final pos = pinPositions[i];
            final title = i < pinTitles.length ? pinTitles[i] : 'Ponto ${i + 1}';
            return Marker(
              point: pos,
              width: 40,
              height: 40,
              alignment: Alignment.topCenter,
              child: GestureDetector(
                onTap: () {
                  showDialog(
                    context: outerContext,
                    builder: (_) => AlertDialog(
                      title: Text(title),
                      content: Text(
                          'px: y=${pos.latitude.toStringAsFixed(0)}, x=${pos.longitude.toStringAsFixed(0)}'),
                    ),
                  );
                },
                child: const Icon(Icons.location_on, size: 32, color: Colors.redAccent),
              ),
            );
          }),
        ),
        // Botão simples para fechar o modo DZI (opcional)
        Positioned(
          top: 24,
          left: 16,
          child: ElevatedButton.icon(
            onPressed: _closeDzi,
            icon: const Icon(Icons.close),
            label: const Text('Sair do DZI'),
          ),
        ),
      ],
    );
  }

  // ----- Favoritos -----
  Widget _buildFavoritesContent(ScrollController scrollController) {
    return Column(
      children: [
        // Barra de pesquisa
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: TextField(
            controller: _searchController,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Pesquisar imagens favoritas...',
              hintStyle: TextStyle(color: Colors.grey[500]),
              prefixIcon: Icon(Icons.search, color: Colors.grey[500]),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, color: Colors.grey),
                      onPressed: () => _searchController.clear(),
                    )
                  : null,
              filled: true,
              fillColor: const Color(0xFF1a1a1a),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(25),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),

        // Grid
        Expanded(
          child: favoriteImages.isEmpty
              ? Center(
                  child: Text(
                    'Nenhuma imagem favorita ainda',
                    style: TextStyle(color: Colors.grey[500]),
                  ),
                )
              : GridView.builder(
                  controller: scrollController,
                  padding: const EdgeInsets.all(8),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 1,
                  ),
                  itemCount: favoriteImages.length,
                  itemBuilder: (context, index) {
                    final imageData = favoriteImages[index];
                    return GestureDetector(
                      onTap: () => _changeMainImage(imageData),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(imageData.url, fit: BoxFit.cover),
                            Container(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.transparent,
                                    Colors.black.withOpacity(0.7),
                                  ],
                                ),
                              ),
                            ),
                            Positioned(
                              bottom: 8,
                              left: 8,
                              right: 8,
                              child: Text(
                                imageData.name,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  // ----- Todas as imagens -----
  Widget _buildAllImagesContent(ScrollController scrollController) {
    return Column(
      children: [
        // Barra de pesquisa
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: TextField(
            controller: _searchController,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Pesquisar por nome...',
              hintStyle: TextStyle(color: Colors.grey[500]),
              prefixIcon: Icon(Icons.search, color: Colors.grey[500]),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, color: Colors.grey),
                      onPressed: () => _searchController.clear(),
                    )
                  : null,
              filled: true,
              fillColor: const Color(0xFF1a1a1a),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(25),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),

        // Grid
        Expanded(
          child: _filteredImages.isEmpty
              ? Center(
                  child: Text(
                    'Nenhuma imagem encontrada',
                    style: TextStyle(color: Colors.grey[500]),
                  ),
                )
              : GridView.builder(
                  controller: scrollController,
                  padding: const EdgeInsets.all(8),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 1,
                  ),
                  itemCount: _filteredImages.length,
                  itemBuilder: (context, index) {
                    final imageData = _filteredImages[index];
                    return GestureDetector(
                      onTap: () => _changeMainImage(imageData),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(imageData.url, fit: BoxFit.cover),
                            Container(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.transparent,
                                    Colors.black.withOpacity(0.7),
                                  ],
                                ),
                              ),
                            ),
                            Positioned(
                              bottom: 8,
                              left: 8,
                              right: 8,
                              child: Text(
                                imageData.name,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  // ----- Info -----
  Widget _buildInfoContent(ScrollController scrollController) {
    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Explorar o Espaço',
          style: TextStyle(
            fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF1a4d8f), Color(0xFF2a5f9f)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Expanded(
                  child: Text(
                    'Marte - O Planeta Vermelho',
                    style: TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ),
                ElevatedButton(
                  onPressed: () {},
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blueAccent,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  ),
                  child: const Text('Visitar', style: TextStyle(fontSize: 12)),
                ),
              ]),
              const SizedBox(height: 8),
              const Text(
                'Marte, conhecido como o "Planeta Vermelho", é o quarto planeta do Sistema Solar. A sua cor avermelhada deve-se ao óxido de ferro presente na sua superfície.',
                style: TextStyle(fontSize: 13, color: Colors.white70, height: 1.4),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        const Text('Mais Imagens Interessantes',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 1),
          itemCount: 4,
          itemBuilder: (context, index) {
            final imageData = allImages[index % allImages.length];
            return GestureDetector(
              onTap: () => _changeMainImage(imageData),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(imageData.url, fit: BoxFit.cover),
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter, end: Alignment.bottomCenter,
                          colors: [Colors.transparent, Colors.black.withOpacity(0.6)],
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 8, left: 8, right: 8,
                      child: Text(
                        imageData.name,
                        style: const TextStyle(
                          color: Colors.white, fontSize: 11, fontWeight: FontWeight.w500),
                        maxLines: 2, overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  // ----- Catálogo DZI -----
  Widget _buildDziCatalogContent(ScrollController scrollController) {
    if (_dziCatalog.isEmpty) {
      return Center(
        child: Text(
          'Nenhum .dzi encontrado em assets/dzi/',
          style: TextStyle(color: Colors.grey[500]),
        ),
      );
    }
    return GridView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 1.2),
      itemCount: _dziCatalog.length,
      itemBuilder: (context, index) {
        final e = _dziCatalog[index];
        return GestureDetector(
          onTap: () => _openDzi(e),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Thumbnail = tile 0/0_0 do DZI
                Image.asset(e.thumbTile0, fit: BoxFit.cover),
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Colors.black.withOpacity(0.65)],
                    ),
                  ),
                ),
                Positioned(
                  bottom: 8, left: 8, right: 8,
                  child: Text(
                    '${e.name}  •  ${e.width}×${e.height}',
                    style: const TextStyle(
                      color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        if (_showSuggestions || _currentSection != 'none') {
          setState(() {
            _showSuggestions = false;
            _currentSection = 'none';
          });
        }
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        extendBodyBehindAppBar: true,
        body: Stack(
          children: [
            // ===== Viewer principal: DZI (se selecionado) OU imagem normal =====
            Positioned.fill(
              child: _currentDzi != null
                  ? buildDeepZoomView(context, dzi: _currentDzi!)
                  : InteractiveViewer(
                      transformationController: _controller,
                      minScale: 0.1,
                      maxScale: 20.0,
                      panEnabled: true,
                      scaleEnabled: true,
                      boundaryMargin: const EdgeInsets.all(double.infinity),
                      constrained: false,
                      child: Center(
                        child: Image.network(
                          _currentImage?.url ?? allImages[0].url,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
            ),

            // ===== Barra superior com pesquisa =====
            Positioned(
              top: 0, left: 0, right: 0,
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter, end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withOpacity(0.6),
                      Colors.black.withOpacity(0.3),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _showSuggestions = true;
                                    _searchSuggestions = List.from(allImages);
                                  });
                                },
                                child: TextField(
                                  controller: _topSearchController,
                                  style: const TextStyle(color: Colors.white),
                                  onTap: () {
                                    setState(() {
                                      _showSuggestions = true;
                                      _searchSuggestions = List.from(allImages);
                                    });
                                  },
                                  decoration: InputDecoration(
                                    hintText: 'Search for something incredible',
                                    hintStyle: TextStyle(color: Colors.grey[400]),
                                    prefixIcon: Icon(Icons.search, color: Colors.grey[400]),
                                    suffixIcon: _topSearchController.text.isNotEmpty
                                        ? IconButton(
                                            icon: const Icon(Icons.clear, color: Colors.grey),
                                            onPressed: () {
                                              setState(() {
                                                _topSearchController.clear();
                                                _showSuggestions = false;
                                              });
                                            },
                                          )
                                        : null,
                                    filled: true,
                                    fillColor: Colors.white.withOpacity(0.15),
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(25),
                                      borderSide: BorderSide.none,
                                    ),
                                    contentPadding:
                                        const EdgeInsets.symmetric(vertical: 12),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            // Ícone exemplo
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.15),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(Icons.location_on, color: Colors.grey[300]),
                            ),
                          ],
                        ),

                        // Sugestões
                        if (_showSuggestions)
                          GestureDetector(
                            onTap: () {},
                            child: Container(
                              margin: const EdgeInsets.only(top: 8),
                              constraints: BoxConstraints(
                                maxHeight: MediaQuery.of(context).size.height * 0.5,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.9),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: ListView.builder(
                                shrinkWrap: true,
                                padding: const EdgeInsets.all(8),
                                itemCount: _searchSuggestions.length,
                                itemBuilder: (context, index) {
                                  final suggestion = _searchSuggestions[index];
                                  return ListTile(
                                    leading: ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: Image.network(
                                        suggestion.url,
                                        width: 50, height: 50, fit: BoxFit.cover,
                                      ),
                                    ),
                                    title: Text(
                                      suggestion.name,
                                      style: const TextStyle(
                                        color: Colors.white, fontWeight: FontWeight.w500),
                                    ),
                                    subtitle: Text(
                                      suggestion.description,
                                      style: TextStyle(
                                        color: Colors.grey[400], fontSize: 12),
                                      maxLines: 1, overflow: TextOverflow.ellipsis,
                                    ),
                                    onTap: () => _selectFromSuggestion(suggestion),
                                  );
                                },
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),

            // ===== Painel inferior deslizante =====
            GestureDetector(
              onTap: () {},
              child: DraggableScrollableSheet(
                initialChildSize: _currentSection == 'none' ? 0.12 : 0.6,
                minChildSize: 0.12,
                maxChildSize: 0.85,
                builder: (context, scrollController) {
                  return Container(
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.5),
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                    ),
                    child: Column(
                      children: [
                        // Handle
                        Container(
                          margin: const EdgeInsets.only(top: 8),
                          width: 40, height: 4,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.5),
                            borderRadius: BorderRadius.circular(20),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Botões
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            _buildActionButton(
                              icon: Icons.bookmark,
                              label: 'Guardados',
                              isActive: _currentSection == 'favorites',
                              onPressed: () {
                                setState(() {
                                  _currentSection =
                                      _currentSection == 'favorites' ? 'none' : 'favorites';
                                });
                              },
                            ),
                            _buildActionButton(
                              icon: Icons.language,
                              label: 'Explorar',
                              isActive: _currentSection == 'images',
                              onPressed: () {
                                setState(() {
                                  _currentSection =
                                      _currentSection == 'images' ? 'none' : 'images';
                                });
                              },
                            ),
                            _buildActionButton(
                              icon: Icons.description,
                              label: 'Detalhes',
                              isActive: _currentSection == 'info',
                              onPressed: () {
                                setState(() {
                                  _currentSection =
                                      _currentSection == 'info' ? 'none' : 'info';
                                });
                              },
                            ),
                            _buildActionButton(
                              icon: Icons.photo_library,
                              label: 'Catálogo DZI',
                              isActive: _currentSection == 'dzi',
                              onPressed: () {
                                setState(() {
                                  _currentSection =
                                      _currentSection == 'dzi' ? 'none' : 'dzi';
                                });
                              },
                            ),
                          ],
                        ),

                        const SizedBox(height: 8),

                        // Conteúdo da secção
                        if (_currentSection != 'none')
                          Expanded(
                            child: Container(
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.5),
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                              ),
                              child: _currentSection == 'favorites'
                                  ? _buildFavoritesContent(scrollController)
                                  : _currentSection == 'images'
                                      ? _buildAllImagesContent(scrollController)
                                      : _currentSection == 'info'
                                          ? _buildInfoContent(scrollController)
                                          : _buildDziCatalogContent(scrollController),
                            ),
                          ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required bool isActive,
    required VoidCallback onPressed,
  }) {
    return GestureDetector(
      onTap: onPressed,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: isActive ? Colors.blueAccent : Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isActive
                    ? Colors.blueAccent.withOpacity(0.5)
                    : Colors.white.withOpacity(0.2),
                width: 1,
              ),
              boxShadow: isActive
                  ? [
                      BoxShadow(
                        color: Colors.blueAccent.withOpacity(0.4),
                        blurRadius: 12,
                        spreadRadius: 2,
                      )
                    ]
                  : [],
            ),
            child: Icon(icon, color: Colors.white, size: 26),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: isActive ? Colors.black : Colors.white.withOpacity(0.7),
              fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
        ],
      ),
    );
  }
}
