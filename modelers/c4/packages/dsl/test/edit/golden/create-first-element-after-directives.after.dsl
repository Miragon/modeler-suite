workspace "Directives" {
    model {
        !identifiers flat
        properties {
            "structurizr.groupSeparator" "/"
        }
        visitor = person "Visitor"
    }

    views {
        systemLandscape "SystemLandscape" {
            include *
            autoLayout tb 300 160
            properties {
                "c4modeler.element.visitor" "0,0"
            }
        }
    }
}
